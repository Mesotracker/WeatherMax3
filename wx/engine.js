/* ============================================================================
 * WeatherMax :: wx/engine.js
 * Ties the NWP core, the convective-element layer and the radar forward
 * operator into one simulation, stores one compact record per 5-minute frame,
 * and derives the operational products: warnings, spotter reports and the
 * model-guidance fields.
 * ========================================================================== */
(function (global) {
  const WX = (global.WX = global.WX || {});
  const { clamp, lerp, hash } = WX;
  const C = WX.C;

  const FRAME_MINUTES = 5;
  const SUBSTEPS = 5;

  /** Relative frequency of each report type in the real US storm-report DB. */
  const REPORT_WEIGHTS = [
    { type: 'wind_damage', label: 'Wind Damage', w: 0.26, min: 58 },
    { type: 'wind_gust', label: 'Wind Gust', w: 0.24, min: 50 },
    { type: 'hail', label: 'Hail', w: 0.22, min: 0.75 },
    { type: 'tornado', label: 'Tornado', w: 0.09, min: 0 },
    { type: 'wind_gust_sig', label: 'Significant Wind Gust', w: 0.08, min: 74 },
    { type: 'hail_sig', label: 'Significant Hail', w: 0.07, min: 2.0 },
    { type: 'tornado_sig', label: 'Significant Tornado', w: 0.04, min: 2 },
  ];

  const WARN_PRODUCTS = {
    tornado: { pils: 'TOR', color: '#ff2d55', name: 'Tornado Warning' },
    severe: { pils: 'SVR', color: '#ffa000', name: 'Severe Thunderstorm Warning' },
    flash: { pils: 'FFW', color: '#8bc34a', name: 'Flash Flood Warning' },
  };

  function createEngine(cfg) {
    const sounding = WX.buildSounding(cfg.soundingInput);
    const nx = cfg.nx ?? 65;
    const ny = cfg.ny ?? 49;
    const dxm = (cfg.dxKm ?? 5) * 1000;
    const grid = WX.createNWP({
      nx,
      ny,
      nz: cfg.nz ?? 14,
      dx: dxm,
      sounding,
      seed: cfg.seed ?? 1,
      motion: sounding.metrics.motion,
      heatFlux: cfg.heatFlux ?? 0.02,
    });
    const storms = WX.createStormField({ grid, sounding, seed: cfg.seed ?? 1 });
    const origin = cfg.origin || WX.RADAR_SITES.find((s) => s.id === 'KTLX') || WX.RADAR_SITES[0];
    const site = {
      id: origin.id,
      name: origin.name,
      city: origin.city,
      lat: origin.lat,
      lon: origin.lon,
      elev: origin.elevM,
      state: origin.state,
      x: (nx * dxm) / 2,
      y: (ny * dxm) / 2,
    };
    const radarCfg = {
      grid,
      storms,
      sounding,
      site,
      maxRangeKm: cfg.maxRangeKm ?? 160,
      azimuths: cfg.azimuths ?? 240,
      tilts: cfg.tilts,
    };
    let radar = WX.createRadar(radarCfg);

    const domainKm = { w: (nx * dxm) / 1000, h: (ny * dxm) / 1000 };
    const frames = [];
    let frameIndex = -1;
    let simMinutes = 0;
    const activeWarnings = [];
    const reports = [];
    const tornadoTracks = [];
    let nextWarnId = 1;
    let nextReportId = 1;

    function init() {
      grid.initialise(cfg.bubbles || []);
      frames.length = 0;
      frameIndex = -1;
      simMinutes = 0;
      activeWarnings.length = 0;
      reports.length = 0;
      tornadoTracks.length = 0;
      storms.update(0);
      capture();
    }

    /* ----------------------------------------------------------- stepping */
    function step() {
      const dt = (FRAME_MINUTES * 60) / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s += 1) {
        grid.step(dt, simMinutes * 60 + s * dt, cfg.boundaryForcing || null);
      }
      simMinutes += FRAME_MINUTES;
      grid.updateDerived(FRAME_MINUTES * 60);
      storms.update(FRAME_MINUTES * 60);
      radar.clearCache();
      capture();
      return frameIndex;
    }

    function snapshotArrays() {
      const n = grid.n2d;
      const cp = (src) => {
        const a = new Float32Array(n);
        a.set(src);
        return a;
      };
      return {
        maxUpdraft: cp(grid.maxUpdraft),
        maxReflectivity: cp(grid.maxReflectivity),
        rainAccum: cp(grid.rainAccum),
        snowAccum: cp(grid.snowAccum),
        coldPool: cp(grid.coldPool),
        surfaceGust: cp(grid.surfaceGust),
        cloudTop: cp(grid.cloudTop),
        cloudBase: cp(grid.cloudBase),
        colHail: cp(grid.colHail),
        helicity: cp(grid.helicity),
      };
    }

    function frameStats(g) {
      let maxW = 0;
      let maxZ = -999;
      let maxGust = 0;
      let maxHail = 0;
      let maxPrcp = 0;
      let maxUH = 0;
      let minThp = 0;
      for (let i = 0; i < grid.n2d; i += 1) {
        if (g.maxUpdraft[i] > maxW) maxW = g.maxUpdraft[i];
        if (g.maxReflectivity[i] > maxZ) maxZ = g.maxReflectivity[i];
        if (g.surfaceGust[i] > maxGust) maxGust = g.surfaceGust[i];
        if (g.colHail[i] > maxHail) maxHail = g.colHail[i];
        if (g.rainAccum[i] > maxPrcp) maxPrcp = g.rainAccum[i];
        if (g.helicity[i] > maxUH) maxUH = g.helicity[i];
        if (g.coldPool[i] < minThp) minThp = g.coldPool[i];
      }
      return {
        maxW,
        maxDbz: 10 * Math.log10(Math.max(maxZ, 1e-6)),
        maxGust,
        maxGustMph: maxGust * C.MPS_TO_MPH,
        maxHailIn: maxHail / 0.0254,
        maxPrcpMm: maxPrcp,
        maxUH,
        minThetaV: minThp,
      };
    }

    function capture() {
      const g = snapshotArrays();
      const stats = frameStats(g);
      const hazards = storms.hazards();
      const elements = storms.elements.map((el) => ({
        id: el.id,
        x: el.x,
        y: el.y,
        w: el.w,
        zeta: el.zeta,
        zetaLow: el.zetaLow,
        hailSize: el.hailSize,
        gust: el.gust,
        rfd: el.rfd,
        hookPhase: el.hookPhase,
        rotationSign: el.rotationSign,
        type: el.system ? el.system.type : 'pulse',
        tornado: el.tornado ? { x: el.tornado.x, y: el.tornado.y, ef: el.tornado.ef, intensity: el.tornado.intensity } : null,
      }));
      const systems = storms.systems.map((sy) => ({
        id: sy.id,
        type: sy.type,
        x: sy.x,
        y: sy.y,
        angle: sy.angle,
        length: sy.length,
        bowAmount: sy.bowAmount,
        members: sy.members.length,
        bookends: sy.bookends.map((b) => ({ x: b.x, y: b.y, sign: b.sign })),
      }));
      // tornado tracks: one contiguous path per tornado, never duplicated
      for (const el of storms.elements) {
        if (!el.tornado) continue;
        let tr = tornadoTracks.find((t) => t.id === `T${el.id}`);
        if (!tr) {
          tr = { id: `T${el.id}`, elementId: el.id, path: [], maxEf: 0, active: true, born: simMinutes };
          tornadoTracks.push(tr);
        }
        tr.path.push({ x: el.tornado.x, y: el.tornado.y, ef: el.tornado.ef, intensity: el.tornado.intensity });
        tr.maxEf = Math.max(tr.maxEf, el.tornado.ef);
        tr.x = el.tornado.x;
        tr.y = el.tornado.y;
        tr.ef = el.tornado.ef;
      }
      for (const tr of tornadoTracks) {
        const alive = storms.elements.some((e) => e.id === tr.elementId && e.tornado);
        if (tr.active && !alive) {
          tr.active = false;
          tr.died = simMinutes;
        }
      }
      updateWarnings(hazards);
      spawnReports(hazards);
      const frame = {
        index: ++frameIndex,
        minutes: simMinutes,
        grid: g,
        stats,
        hazards,
        elements,
        systems,
        tornadoes: tornadoTracks.map((t) => ({
          id: t.id,
          path: t.path.slice(),
          maxEf: t.maxEf,
          active: t.active,
          x: t.x,
          y: t.y,
          ef: t.ef,
        })),
        warnings: activeWarnings.map((w) => ({ ...w, polygon: w.polygon.slice() })),
        reports: reports.filter((r) => r.minutes <= simMinutes).slice(-400),
      };
      frames.push(frame);
      return frame;
    }

    /* ----------------------------------------------------------- warnings */
    function polygonFor(hz) {
      // a storm-based warning polygon: an elongated hexagon aligned with the
      // storm motion, roughly the shape NWS issues
      const spd = sounding.metrics.motion.speed || 15;
      const ux = sounding.metrics.motion.u / spd;
      const uy = sounding.metrics.motion.v / spd;
      const L = hz.kind === 'tornado' ? 9000 : 15000;
      const W = hz.kind === 'tornado' ? 5200 : 9000;
      const pts = [];
      const shape = [
        [-1.2, -0.35],
        [-0.2, -0.6],
        [1.15, -0.28],
        [1.25, 0.12],
        [0.1, 0.62],
        [-1.05, 0.4],
      ];
      for (const [a, b] of shape) {
        pts.push({ x: hz.x + ux * a * L - uy * b * W, y: hz.y + uy * a * L + ux * b * W });
      }
      return pts;
    }

    function updateWarnings(hazards) {
      // expire
      for (let i = activeWarnings.length - 1; i >= 0; i -= 1) {
        const w = activeWarnings[i];
        w.remaining -= FRAME_MINUTES;
        if (w.remaining <= 0) {
          w.status = 'expired';
          activeWarnings.splice(i, 1);
        }
      }
      const groups = { tornado: [], severe: [], flash: [] };
      for (const h of hazards) {
        if (h.kind === 'tornado') groups.tornado.push(h);
        else if (h.kind === 'flood') groups.flash.push(h);
        else groups.severe.push(h);
      }
      for (const [kind, list] of Object.entries(groups)) {
        if (!list.length) continue;
        // merge hazards that are within 35 km into one polygon
        const used = new Set();
        for (const h of list) {
          if (used.has(h.id)) continue;
          const cluster = [h];
          used.add(h.id);
          for (const o of list) {
            if (used.has(o.id)) continue;
            if (Math.hypot(o.x - h.x, o.y - h.y) < 35000) {
              cluster.push(o);
              used.add(o.id);
            }
          }
          const cx = cluster.reduce((a, b) => a + b.x, 0) / cluster.length;
          const cy = cluster.reduce((a, b) => a + b.y, 0) / cluster.length;
          const existing = activeWarnings.find(
            (w) => w.kind === kind && Math.hypot(w.x - cx, w.y - cy) < 55000,
          );
          const tag = worstTag(cluster, kind);
          if (existing) {
            existing.x = lerp(existing.x, cx, 0.5);
            existing.y = lerp(existing.y, cy, 0.5);
            existing.polygon = polygonFor({ kind, x: existing.x, y: existing.y });
            existing.remaining = kind === 'tornado' ? 30 : 45;
            existing.tag = tag;
            existing.severity = Math.max(existing.severity, Math.max(...cluster.map((c) => c.severity)));
            existing.storms = cluster.length;
          } else if (activeWarnings.length < 9) {
            activeWarnings.push({
              id: `${WARN_PRODUCTS[kind].pils}-${nextWarnId++}`,
              kind,
              name: WARN_PRODUCTS[kind].name,
              color: WARN_PRODUCTS[kind].color,
              x: cx,
              y: cy,
              tag,
              severity: Math.max(...cluster.map((c) => c.severity)),
              polygon: polygonFor({ kind, x: cx, y: cy }),
              issued: simMinutes,
              remaining: kind === 'tornado' ? 30 : 45,
              expires: simMinutes + (kind === 'tornado' ? 30 : 45),
              storms: cluster.length,
              detail: warningDetail(kind, cluster, tag),
            });
          }
        }
      }
    }

    function worstTag(cluster, kind) {
      if (kind === 'tornado') {
        const ef = Math.max(...cluster.map((c) => c.ef || 0));
        return ef >= 4 ? 'catastrophic' : ef >= 2 ? 'considerable' : 'base';
      }
      const tags = cluster.map((c) => c.tag);
      if (tags.includes('destructive')) return 'destructive';
      if (tags.includes('considerable')) return 'considerable';
      return 'base';
    }

    function warningDetail(kind, cluster, tag) {
      if (kind === 'tornado') {
        const h = cluster[0];
        const ef = h.ef || 0;
        const label = tag === 'catastrophic' ? 'TORNADO EMERGENCY' : tag === 'considerable' ? 'PARTICULARLY DANGEROUS SITUATION' : null;
        return {
          headline: label || 'Tornado Warning',
          ef,
          mph: WX.efWindFromScale ? WX.efWindFromScale(ef) : 105 + ef * 30,
          hailIn: Math.max(...cluster.map((c) => c.inches || 0)),
          windMph: 0,
        };
      }
      if (kind === 'flash') {
        return { headline: 'Flash Flood Warning', inches: Math.max(...cluster.map((c) => c.inches || 0)) };
      }
      const wind = Math.max(...cluster.map((c) => c.mph || 0));
      const hail = Math.max(...cluster.map((c) => c.inches || 0));
      return { headline: tag === 'destructive' ? 'DESTRUCTIVE SEVERE THUNDERSTORM WARNING' : tag === 'considerable' ? 'CONSIDERABLE SEVERE THUNDERSTORM WARNING' : 'Severe Thunderstorm Warning', windMph: wind, hailIn: hail };
    }

    /* ------------------------------------------------------------ reports */
    function spawnReports(hazards) {
      const fi = frameIndex;
      for (let hi = 0; hi < hazards.length; hi += 1) {
        const h = hazards[hi];
        const roll = hash(fi * 7 + hi, Math.round(simMinutes * 3 + hi * 11), 3, 991 + hi);
        // report rate scales with hazard intensity; tuned so a 5-hour severe
        // outbreak yields a few hundred reports with the observed mix
        const intensity = clamp(h.severity, 0, 1);
        const base = h.kind === 'tornado' ? 0.42 : h.kind === 'hail' ? 0.3 : h.kind === 'flood' ? 0.05 : 0.34;
        const rate = base * (0.45 + 0.9 * intensity);
        if (roll > rate) continue;
        const pick = hash(fi * 13 + hi * 5, Math.round(simMinutes * 1.7), 4, 313 + hi * 37);
        let acc = 0;
        let chosen = REPORT_WEIGHTS[0];
        for (const rw of REPORT_WEIGHTS) {
          acc += rw.w;
          if (pick <= acc) {
            chosen = rw;
            break;
          }
        }
        const r = makeReport(chosen, h, fi);
        if (!r) continue;
        // do not pile reports on top of each other
        if (reports.some((o) => o.minutes > simMinutes - 10 && Math.hypot(o.x - r.x, o.y - r.y) < 7000 && o.type === r.type)) continue;
        reports.push(r);
      }
    }

    function makeReport(chosen, h, fi) {
      const jx = (hash(fi * 5 + 1, Math.round(h.x), Math.round(h.y), 71) - 0.5) * 16000;
      const jy = (hash(fi * 5 + 2, Math.round(h.y), Math.round(h.x), 73) - 0.5) * 16000;
      const x = clamp(h.x + jx, 0, domainKm.w * 1000);
      const y = clamp(h.y + jy, 0, domainKm.h * 1000);
      const base = {
        id: `R${nextReportId++}`,
        minutes: simMinutes,
        x,
        y,
        type: chosen.type,
        label: chosen.label,
        significant: chosen.type.endsWith('_sig') || chosen.type === 'tornado',
      };
      const rnd = hash(fi * 3 + 9, Math.round(x), Math.round(y), 5);
      switch (chosen.type) {
        case 'wind_damage': {
          if ((h.mph || 0) < 58) return null;
          const mph = Math.round(clamp(58 + rnd * 32, 58, 95));
          return { ...base, value: mph, unit: 'mph', text: `${mph} MPH WIND GUST. ${pick(['Trees down','Roof damage','Power lines down','Shingle damage','Large limb down'])}.` };
        }
        case 'wind_gust': {
          const mph = Math.round(clamp(50 + rnd * 24, 50, 73));
          return { ...base, value: mph, unit: 'mph', text: `${mph} MPH WIND GUST measured ${pick(['by trained spotter','at the airport','by a mesonet station','by emergency management'])}.` };
        }
        case 'wind_gust_sig': {
          if ((h.mph || 0) < 70) return null;
          const mph = Math.round(clamp(74 + rnd * 32, 74, 105));
          return { ...base, value: mph, unit: 'mph', significant: true, text: `${mph} MPH WIND GUST. ${pick(['Numerous trees snapped','Mobile home rolled','Semi truck overturned','Building damage'])}.` };
        }
        case 'hail': {
          const inches = Math.round(clamp(0.75 + rnd * 0.7, 0.75, 1.4) * 100) / 100;
          return { ...base, value: inches, unit: 'in', text: `${inches.toFixed(2)} IN HAIL. ${pick(['Quarter to half dollar size','Penny to quarter size','Covering the ground'])}.` };
        }
        case 'hail_sig': {
          if ((h.inches || 0) < 1.5) return null;
          const inches = Math.round(clamp(2.0 + rnd * 1.9, 2.0, 4.25) * 100) / 100;
          return { ...base, value: inches, unit: 'in', significant: true, text: `${inches.toFixed(2)} IN HAIL. ${pick(['Softball size','Windshield damage reported','Vehicle windows broken','Significant roof damage'])}.` };
        }
        case 'tornado': {
          if (h.kind !== 'tornado') return null;
          return { ...base, value: 'EF0-EF1', text: `${pick(['Tornado on the ground','Funnel cloud on the ground','Large cone tornado'])}, moving ${motionWord()}.` };
        }
        case 'tornado_sig': {
          if (h.kind !== 'tornado' || (h.ef || 0) < 2) return null;
          return { ...base, value: `EF${h.ef}`, significant: true, text: `${pick(['Large tornado','Wide tornado causing major damage','Debris ball evident on radar'])}, EF${h.ef} damage indicators.` };
        }
        default:
          return null;
      }
    }

    function pick(arr) {
      const r = hash(frameIndex * 17 + 3, reports.length * 7 + 1, 4, 77);
      return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
    }
    function motionWord() {
      const met = sounding.metrics.motion.met;
      const names = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
      return names[Math.round(((met % 360) + 360) % 360 / 45) % 8];
    }

    /* ------------------------------------------------------ model guidance
     * Each CAM scheme sees a biased version of the truth: a timing offset, a
     * displacement and its own Z-R / updraft bias. */
    function modelField(model, product) {
      const bias = model.bias || {};
      const shiftKm = bias.shiftKm ?? 0;
      const timing = bias.timingMin ?? 0;
      const idx = clamp(Math.round((simMinutes - timing) / FRAME_MINUTES), 0, frames.length - 1);
      const f = frames[idx] || frames[frames.length - 1];
      const spd = sounding.metrics.motion.speed || 15;
      const offX = (sounding.metrics.motion.u / spd) * shiftKm * 1000;
      const offY = (sounding.metrics.motion.v / spd) * shiftKm * 1000;
      const out = new Float32Array(grid.n2d);
      const scale = bias.zScale ?? 1;
      for (let j = 0; j < grid.ny; j += 1) {
        for (let i = 0; i < grid.nx; i += 1) {
          const si = Math.round((i * grid.dx + offX) / grid.dx);
          const sj = Math.round((j * grid.dx + offY) / grid.dx);
          if (si < 0 || sj < 0 || si >= grid.nx || sj >= grid.ny) continue;
          const src = sj * grid.nx + si;
          const dst = j * grid.nx + i;
          if (product === 'compz') {
            out[dst] = 10 * Math.log10(Math.max(f.grid.maxReflectivity[src], 1e-6)) * scale + (bias.dbzOffset ?? 0);
          } else if (product === 'uh') {
            out[dst] = grid.helicity[src] * (bias.uhScale ?? 1);
          } else if (product === 'wind10') {
            out[dst] = f.grid.surfaceGust[src] * C.MPS_TO_MPH * (bias.windScale ?? 1);
          } else if (product === 'hail') {
            out[dst] = (f.grid.colHail[src] / 0.0254) * (bias.hailScale ?? 1);
          } else if (product === 'qpf') {
            out[dst] = (f.grid.rainAccum[src] / 25.4) * (bias.qpfScale ?? 1);
          }
        }
      }
      return out;
    }

    /* --------------------------------------------------------------- misc */
    /**
     * Move the radar without touching the simulation. The storm field, the
     * frame history, issued products and the score all survive; only the
     * viewing geometry changes, exactly as switching sites in AWIPS does.
     */
    function setSite(newSite) {
      const proj = WX.makeProjection(newSite.lat, newSite.lon);
      const here = proj.toXY(site.lat, site.lon);
      site.id = newSite.id;
      site.name = newSite.name;
      site.city = newSite.city;
      site.state = newSite.state;
      site.lat = newSite.lat;
      site.lon = newSite.lon;
      site.elev = newSite.elevM;
      // keep the model domain fixed; only the antenna moves within it
      site.x = clamp(site.x - here.x * 1000, 0, grid.nx * grid.dx);
      site.y = clamp(site.y - here.y * 1000, 0, grid.ny * grid.dx);
      radar = WX.createRadar({ ...radarCfg, site });
      return radar;
    }

    /** Escalation: the environment gets more unstable and new cells initiate
     *  as the shift goes on, so an unattended desk loses control. */
    function escalate(minutes) {
      const ramp = clamp(minutes / 240, 0, 1.6);
      const n = Math.floor(ramp * 3);
      for (let i = 0; i < n; i += 1) {
        const hx = WX.hash(i * 31 + 7, Math.floor(minutes / 30), 3, 4242);
        const hy = WX.hash(i * 17 + 3, Math.floor(minutes / 30), 5, 917);
        grid.addBubble({
          x: (0.12 + 0.76 * hx) * grid.nx * grid.dx,
          y: (0.12 + 0.76 * hy) * grid.ny * grid.dx,
          radius: 12000 + 6000 * ramp,
          dTheta: 1.6 + 1.4 * ramp,
          dQv: (1.0e-3 + 8e-4 * ramp),
        });
      }
      return ramp;
    }

    function sampleCursor(xKm, yKm) {
      const x = xKm * 1000;
      const y = yKm * 1000;
      const col = grid.colIndex(x, y);
      const st = grid.stateAt(x, y, 1000);
      const dxr = x - site.x;
      const dyr = y - site.y;
      const rangeKm = Math.hypot(dxr, dyr) / 1000;
      return {
        rangeKm,
        bearing: ((Math.atan2(dxr, dyr) * 180) / Math.PI + 360) % 360,
        T: st.T - C.T0,
        Td: WX.dewpointFromQ ? WX.dewpointFromQ(st.qv, st.p) : 0,
        windMph: Math.hypot(st.u, st.v) * C.MPS_TO_MPH,
        windDir: ((Math.atan2(-st.u, -st.v) * 180) / Math.PI + 360) % 360,
        updraft: col >= 0 ? grid.maxUpdraft[col] : 0,
        rainMm: col >= 0 ? grid.rainAccum[col] : 0,
        hailIn: col >= 0 ? grid.colHail[col] / 0.0254 : 0,
        gustMph: col >= 0 ? grid.surfaceGust[col] * C.MPS_TO_MPH : 0,
        cloudTopKm: col >= 0 ? grid.cloudTop[col] / 1000 : 0,
      };
    }

    return {
      sounding,
      grid,
      storms,
      get radar() {
        return radar;
      },
      site,
      domainKm,
      frames,
      init,
      step,
      capture,
      modelField,
      sampleCursor,
      setSite,
      escalate,
      tornadoTracks,
      reports,
      activeWarnings,
      get frameIndex() {
        return frameIndex;
      },
      get simMinutes() {
        return simMinutes;
      },
      FRAME_MINUTES,
      SUBSTEPS,
      REPORT_WEIGHTS,
    };
  }

  WX.createEngine = createEngine;
  WX.efWindFromScale = (ef) => [105, 110, 135, 165, 200, 260][clamp(ef | 0, 0, 5)];
})(typeof self !== 'undefined' ? self : globalThis);
