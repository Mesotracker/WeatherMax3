/* ============================================================================
 * WeatherMax :: wx/radar.js
 * A genuine WSR-88D forward operator. Polar sampling on the real elevation
 * cone, 4/3-earth beam propagation, range-dependent beam-volume broadening,
 * attenuation, bright band, Nyquist folding, cone of silence, ground clutter
 * and range folding - then rasterised onto the map.
 *
 *   beam height   h = sqrt(r^2 + (ke*Re)^2 + 2*r*ke*Re*sin(th)) - ke*Re + h_ant
 *   beam width    sigma_beam = 0.42 * r * theta_b        (theta_b = 1.0 deg)
 *   measured Z    the reflectivity of the volume averaged over sigma_beam,
 *                 which is exactly what inflates distant mesocyclones and
 *                 smears velocity couplets beyond ~90 km
 *   Nyquist       +/- 26 m/s for the WSR-88D batch-5 VCP
 * ========================================================================== */
(function (global) {
  const WX = (global.WX = global.WX || {});
  const C = WX.C;
  const { clamp, lerp, hash } = WX;

  const KE = 4 / 3; // effective earth radius factor
  const RE = 6371000; // m
  const KE_RE = KE * RE;
  const DEG2RAD = Math.PI / 180;
  const LOG10E = 0.4342944819032518;
  const log10 = (x) => Math.log(x) * LOG10E;
  const BEAMWIDTH_RAD = 1.0 * DEG2RAD;
  const NYQUIST = 26; // m/s
  const ANTENNA_M = 10;

  const PRECIP = {
    NONE: 0,
    RAIN: 1,
    MIXED: 2,
    SNOW: 3,
    HAIL: 4,
    DRY_SNOW: 5,
  };
  const PRECIP_NAMES = ['None', 'Rain', 'Rain/Snow', 'Snow', 'Hail', 'Dry Snow'];

  const Z_SCALE = { rain: 4.0e4, snow: 2.0e3, hail: 2.6e5 };

  function createRadar(cfg) {
    const grid = cfg.grid;
    const storms = cfg.storms;
    const sounding = cfg.sounding;
    const site = cfg.site;
    const nAz = cfg.azimuths ?? 360;
    const maxRange = (cfg.maxRangeKm ?? 230) * 1000;
    // 250 m gates out to 46 km (the WSR-88D short-pulse block), then 1 km
    const shortGates = 184;
    const shortSpacing = 250;
    const longSpacing = 1000;
    const longGates = Math.ceil((maxRange - shortGates * shortSpacing) / longSpacing);
    const nGate = shortGates + longGates;
    const ranges = new Float64Array(nGate);
    const spacing = new Float64Array(nGate);
    for (let g = 0; g < nGate; g += 1) {
      if (g < shortGates) {
        ranges[g] = (g + 0.5) * shortSpacing;
        spacing[g] = shortSpacing;
      } else {
        ranges[g] = shortGates * shortSpacing + (g - shortGates + 0.5) * longSpacing;
        spacing[g] = longSpacing;
      }
    }

    const tilts = cfg.tilts || [0.5, 0.9, 1.3, 1.8, 2.4, 3.4, 4.3, 6.0, 9.9, 14.6, 19.5];
    const cache = new Map();
    let cacheFrame = -1;

    function newScan(tilt) {
      return {
        tilt,
        Z: new Float32Array(nAz * nGate).fill(-999),
        V: new Float32Array(nAz * nGate).fill(-999),
        VR: new Float32Array(nAz * nGate).fill(-999),
        W: new Float32Array(nAz * nGate).fill(-999),
        CC: new Float32Array(nAz * nGate).fill(-999),
        ZDR: new Float32Array(nAz * nGate).fill(-999),
        PTYPE: new Uint8Array(nAz * nGate),
        H: new Float32Array(nAz * nGate),
        fold: new Int8Array(nAz * nGate),
      };
    }

    /** Reflectivity (mm6/m3) and the mixing state of a hydrometeor set. */
    function reflectivityOf(qr, qs, qh, rho, tempC) {
      const mr = rho * 1000;
      const qrG = qr * mr;
      const qsG = qs * mr;
      const qhG = qh * mr;
      let Z = Z_SCALE.rain * qrG * qrG + Z_SCALE.snow * qsG * qsG;
      const hailZ = Z_SCALE.hail * qhG * qhG * (tempC > 0 ? 0.25 : 1);
      Z += hailZ;
      return { Z, hailZ, qrG, qsG, qhG };
    }

    /**
     * Correlation coefficient from the hydrometeor mixture. Empirical values
     * for S-band (Dolan & Rutledge 2009, Ryzhkov 2005) are used as the anchors
     * and the mixture is averaged in the linear (rho_hv) domain.
     */
    function correlationOf(qrG, qsG, qhG, tempC, qcG) {
      let num = 0;
      let den = 0;
      const add = (mass, value) => {
        num += mass * value;
        den += mass;
      };
      if (qrG > 0.01) add(qrG, tempC > 2 ? 0.985 : 0.97);
      if (qsG > 0.01) add(qsG, 0.94);
      if (qhG > 0.01) add(qhG, 0.86);
      if (qcG > 0.01) add(qcG, 0.99);
      if (den <= 0) return 0.995;
      let v = num / den;
      if (qhG > 0.02 && qrG > 0.05) v = Math.min(v, 0.78 + 0.12 / (1 + qhG)); // wet hail
      return v;
    }

    /** Differential reflectivity (dB) from the mixture. */
    function zdrOf(qrG, qsG, qhG, qcG) {
      const total = qrG + qsG + qhG + qcG;
      if (total < 0.02) return -0.5;
      const wR = qrG / total;
      const wS = qsG / total;
      const wH = qhG / total;
      const wC = qcG / total;
      // oblate large drops -> high ZDR; tumbling hail -> near zero; snow/dry
      // aggregates slightly positive; pure cloud droplets near zero
      const zRain = 0.5 + 2.0 * clamp(Math.log10(Math.max(qrG, 1e-3)) + 3, 0, 1);
      return clamp(1.5 * wR + 0.6 * wS + (-0.4) * wH + 0.1 * wC - 0.2, -1.2, 4.5);
    }

    function classifyPrecip(Z, cc, zdr, tempC, qhG, qrG, qsG) {
      const dbz = 10 * Math.log10(Math.max(Z, 1e-8));
      if (dbz < 5) return PRECIP.NONE;
      if (qhG > 0.05 && dbz > 45) return PRECIP.HAIL;
      if (cc < 0.85) return PRECIP.HAIL;
      if (tempC > 1.5) {
        if (cc > 0.97) return PRECIP.RAIN;
        return PRECIP.MIXED;
      }
      if (tempC > -1.5) return PRECIP.MIXED;
      if (cc < 0.93 || zdr > 1.5) return PRECIP.SNOW;
      return PRECIP.DRY_SNOW;
    }

    /* --------------------------------------------------------------- scan */
    // per-tilt geometry tables: beam height and the model level bracket
    const geoCache = new Map();
    function geometry(tiltIndex) {
      if (geoCache.has(tiltIndex)) return geoCache.get(tiltIndex);
      const tiltRad = tilts[tiltIndex] * DEG2RAD;
      const H = new Float64Array(nGate);
      const K = new Int32Array(nGate);
      const TZ = new Float32Array(nGate);
      for (let g = 0; g < nGate; g += 1) {
        const r = ranges[g];
        const h =
          Math.sqrt(r * r + KE_RE * KE_RE + 2 * r * KE_RE * Math.sin(tiltRad)) -
          KE_RE +
          ANTENNA_M;
        H[g] = h;
        if (h > grid.zTop || h < 0) {
          K[g] = -1;
          continue;
        }
        K[g] = grid.levelAt(h);
        TZ[g] = grid.levelWeight(h, K[g]);
      }
      const geo = { H, K, TZ };
      geoCache.set(tiltIndex, geo);
      return geo;
    }

    function scanAt(tiltIndex, frame) {
      const key = tiltIndex;
      if (cacheFrame === frame && cache.has(key)) return cache.get(key);
      const scan = newScan(tilts[tiltIndex]);
      const geo = geometry(tiltIndex);
      let nLive = 0;
      let nBroaden = 0;
      const ov = { qc: 0, qr: 0, qh: 0, u: 0, v: 0 };
      const st = { qc: 0, qr: 0, qs: 0, qh: 0, u: 0, v: 0, rho: 0, Tc: 0 };
      const hyd = { qc: 0, qr: 0, qs: 0, qh: 0, rho: 0, Tc: 0 };
      const zTop = grid.zTop;
      const siteX = site.x;
      const siteY = site.y;
      const gdx = grid.dx;
      const gnx = grid.nx;
      const gny = grid.ny;
      const shortBlock = shortGates * shortSpacing;

      const GX = geo.H;
      const GK = geo.K;
      const GTZ = geo.TZ;
      // Azimuth-outer / gate-inner: consecutive gates walk radially outward,
      // which keeps the memory access contiguous. Gate-outer walks a ring and
      // thrashed the cache badly enough to cost 4x.
      for (let a = 0; a < nAz; a += 1) {
        const az = ((a + 0.5) * Math.PI * 2) / nAz;
        const sinAz = Math.sin(az);
        const cosAz = Math.cos(az);
        const aBase = a * nGate;
        for (let g = 0; g < nGate; g += 1) {
          const kIdx = GK[g];
          if (kIdx < 0) continue;
          const r = ranges[g];
          const h = GX[g];
          const tz = GTZ[g];
          const gx = siteX + r * sinAz;
          const gy = siteY + r * cosAz;
          if (gx < 0 || gy < 0 || gx > gnx * gdx || gy > gny * gdx) continue;
          nLive += 1;
          const gi = aBase + g;
          scan.H[gi] = h;
          grid.hydroFast(gx / gdx, gy / gdx, kIdx, tz, st);
          storms.overlayAt(gx, gy, h, ov);
          let qr = st.qr + ov.qr;
          let qs = st.qs;
          let qh = st.qh + ov.qh;
          let qc = st.qc + ov.qc;
          const uTot = st.u + ov.u;
          const vTot = st.v + ov.v;
          const sigma = 0.42 * r * BEAMWIDTH_RAD;
          if (sigma > 350 && qr + qs + qh + qc > 2e-6) {
            nBroaden += 1;
            // beam-volume convolution: average across the beam at +/- sigma
            const px = cosAz * sigma;
            const py = -sinAz * sigma;
            for (let s = -1; s <= 1; s += 2) {
              const bx = gx + px * s;
              const by = gy + py * s;
              if (bx < 0 || by < 0 || bx > gnx * gdx || by > gny * gdx) continue;
              grid.hydroFast(bx / gdx, by / gdx, kIdx, tz, hyd);
              storms.overlayAt(bx, by, h, ov);
              qr += (hyd.qr + ov.qr) * 0.5;
              qs += hyd.qs * 0.5;
              qh += (hyd.qh + ov.qh) * 0.5;
              qc += (hyd.qc + ov.qc) * 0.5;
            }
            qr *= 0.5;
            qs *= 0.5;
            qh *= 0.5;
            qc *= 0.5;
          }
          const rho = st.rho;
          const tempC = st.Tc;
          const mr = rho * 1000;
          const qrG = qr * mr;
          const qsG = qs * mr;
          const qhG = qh * mr;
          const qcG = qc * mr;
          let Z = Z_SCALE.rain * qrG * qrG + Z_SCALE.snow * qsG * qsG;
          Z += Z_SCALE.hail * qhG * qhG * (tempC > 0 ? 0.25 : 1);
          const frz = sounding.metrics.freezing;
          let ccDrop = 0;
          if (frz > 0 && h > frz - 300 && h < frz + 400 && (qsG > 0.05 || qhG > 0.05)) {
            Z *= 2.6;
            ccDrop = 0.09;
          }
          if (Z < 0.1) continue;
          const dbz = 10 * log10(Z);
          if (dbz < 5) continue;
          const atten = 0.0006 * Math.min(80, dbz - 20) * (r / 1000) * 0.02;
          let out = dbz - atten;
          if (tiltIndex < 2 && r < 26000) {
            const clutter = 22 + 26 * hash(a, g, 5, 17) - r / 1800;
            if (clutter > out) out = clamp(clutter, -5, 55);
          }
          scan.Z[gi] = out;
          const cc = clamp(correlationOf(qrG, qsG, qhG, tempC, qcG) - ccDrop, 0.2, 1);
          scan.CC[gi] = cc;
          scan.ZDR[gi] = zdrOf(qrG, qsG, qhG, qcG);
          scan.PTYPE[gi] = classifyPrecip(Z, cc, scan.ZDR[gi], tempC, qhG, qrG, qsG);
          const vr = uTot * sinAz + vTot * cosAz;
          scan.VR[gi] = vr;
          const folded = ((vr + NYQUIST) % (2 * NYQUIST) + 2 * NYQUIST) % (2 * NYQUIST) - NYQUIST;
          scan.V[gi] = folded;
          scan.fold[gi] = Math.abs(vr - folded) > 0.5 ? (vr > 0 ? 1 : -1) : 0;
          scan.W[gi] = clamp(1.1 + Math.abs(vr) * 0.06 + (sigma / 12000) * 4 + (qrG > 0.5 ? 3 : 0), 0, 12);
        }
      }
      cache.set(key, scan);
      lastCounts = { live: nLive, broaden: nBroaden };
      return scan;
    }

    let lastCounts = { live: 0, broaden: 0 };
    function clearCache() {
      cache.clear();
      cacheFrame = -1;
    }
    function markFrame(f) {
      if (cacheFrame !== f) {
        cache.clear();
        cacheFrame = f;
      }
    }

    /* ------------------------------------------------- composite & MRMS */
    /** Max reflectivity over the lowest few tilts (composite reflectivity). */
    function composite(tiltIndices, frame) {
      markFrame(frame);
      const out = {
        Z: new Float32Array(nAz * nGate).fill(-999),
        V: new Float32Array(nAz * nGate).fill(-999),
        VR: new Float32Array(nAz * nGate).fill(-999),
        H: new Float32Array(nAz * nGate),
        PTYPE: new Uint8Array(nAz * nGate),
        CC: new Float32Array(nAz * nGate).fill(-999),
      };
      for (const ti of tiltIndices) {
        const s = scanAt(ti, frame);
        for (let i = 0; i < s.Z.length; i += 1) {
          if (s.Z[i] > out.Z[i]) {
            out.Z[i] = s.Z[i];
            out.V[i] = s.V[i];
            out.VR[i] = s.VR[i];
            out.H[i] = s.H[i];
            out.PTYPE[i] = s.PTYPE[i];
            out.CC[i] = s.CC[i];
          }
        }
      }
      return out;
    }

    /**
     * MRMS-style coarse Cartesian composite on a 2 km grid, built from the
     * nearest radar within 230 km. Rotation is then derived from THIS coarse
     * field, so a distant mesocyclone appears broader and weaker - exactly
     * like the real product.
     */
    function mrmsGrid(tiltIndices, frame, stepKm = 2) {
      markFrame(frame);
      const comp = composite(tiltIndices, frame);
      const w = Math.ceil((grid.nx * grid.dx) / (stepKm * 1000));
      const h = Math.ceil((grid.ny * grid.dx) / (stepKm * 1000));
      const Z = new Float32Array(w * h).fill(-999);
      const Vt = new Float32Array(w * h).fill(-999);
      const CC = new Float32Array(w * h).fill(-999);
      const PT = new Uint8Array(w * h);
      const step = stepKm * 1000;
      const gateStepIdx = new Int32Array(w * h).fill(-1);
      for (let j = 0; j < h; j += 1) {
        for (let i = 0; i < w; i += 1) {
          const x = (i + 0.5) * step;
          const y = (j + 0.5) * step;
          const dxr = x - site.x;
          const dyr = y - site.y;
          const r = Math.hypot(dxr, dyr);
          if (r > maxRange || r < 500) continue;
          let az = Math.atan2(dxr, dyr);
          if (az < 0) az += Math.PI * 2;
          const a = clamp(Math.floor((az / (Math.PI * 2)) * nAz), 0, nAz - 1);
          // nearest gate
          let g = 0;
          if (r < shortGates * shortSpacing) g = Math.floor(r / shortSpacing);
          else g = shortGates + Math.floor((r - shortGates * shortSpacing) / longSpacing);
          g = clamp(g, 0, nGate - 1);
          const gi = a * nGate + g;
          if (comp.Z[gi] <= -900) continue;
          const o = j * w + i;
          Z[o] = comp.Z[gi];
          CC[o] = comp.CC[gi];
          PT[o] = comp.PTYPE[gi];
          gateStepIdx[o] = gi;
          // tangential (azimuthally perpendicular) component of the wind
          const sinAz = Math.sin(az);
          const cosAz = Math.cos(az);
          Vt[o] = comp.V[gi]; // radial at the gate; rotation is derived below
          // store the radial unit vector implicitly via az
        }
      }
      // rotational quantities from the coarse radial-velocity field
      const rot = new Float32Array(w * h);
      const rotVel = new Float32Array(w * h);
      const shear = new Float32Array(w * h);
      const delta = Math.max(1, Math.round(2000 / step));
      for (let j = 0; j < h; j += 1) {
        for (let i = 0; i < w; i += 1) {
          const o = j * w + i;
          if (gateStepIdx[o] < 0) continue;
          const gi = gateStepIdx[o];
          const a = Math.floor(gi / nGate);
          const az = ((a + 0.5) * Math.PI * 2) / nAz;
          // sample either side along the azimuth at +/- 2 km arc
          const dA = 2000 / Math.max(2000, ranges[gi % nGate]);
          let vmax = -999;
          let vmin = 999;
          for (const s of [-1, 1]) {
            const aa = (a + Math.round(s * dA * (nAz / (Math.PI * 2))) + nAz) % nAz;
            const gi2 = aa * nGate + (gi % nGate);
            const v = comp.VR[gi2];
            if (v <= -900) continue;
            if (v > vmax) vmax = v;
            if (v < vmin) vmin = v;
          }
          if (vmax < -900 || vmin > 900) continue;
          const dist = 4000; // m across the sampling pair
          // azimuthal shear, SI:  (Vmax - Vmin) / (2 * delta-r)   [s-1]
          rot[o] = (vmax - vmin) / (2 * dist);
          rotVel[o] = (Math.abs(vmax) + Math.abs(vmin)) / 2;
          shear[o] = (vmax - vmin) / 2;
        }
      }
      return { w, h, step, Z, Vt, CC, PT, rot, rotVel, shear };
    }

    /* ------------------------------------------------------- rasterising */
    /**
     * Paint a moment into an RGBA buffer. Pixel (0,0) is (x0, y0) in model km.
     */
    // The pixel -> (azimuth, gate) index map depends only on the view, so it
    // is built once and reused for every frame and every product.
    const viewCache = new Map();
    function viewIndex(view) {
      const key = `${view.x0}|${view.y0}|${view.x1}|${view.y1}|${view.width}|${view.height}`;
      if (viewCache.has(key)) return viewCache.get(key);
      const w = view.width;
      const h = view.height;
      const idx = new Int32Array(w * h).fill(-1);
      const x0 = view.x0 * 1000;
      const y0 = view.y0 * 1000;
      const mPerPx = ((view.x1 - view.x0) * 1000) / w;
      const kmPerPxY = ((view.y1 - view.y0) * 1000) / h;
      const maxR2 = maxRange * maxRange;
      const shortBlock = shortGates * shortSpacing;
      const invShort = 1 / shortSpacing;
      const invLong = 1 / longSpacing;
      const TWO_PI = Math.PI * 2;
      const invAz = nAz / TWO_PI;
      for (let py = 0; py < h; py += 1) {
        const dyr = y0 + (py + 0.5) * kmPerPxY - site.y;
        const row = py * w;
        for (let px = 0; px < w; px += 1) {
          const dxr = x0 + (px + 0.5) * mPerPx - site.x;
          const r2 = dxr * dxr + dyr * dyr;
          if (r2 > maxR2 || r2 < 2.5e4) continue;
          const r = Math.sqrt(r2);
          let az = Math.atan2(dxr, dyr);
          if (az < 0) az += TWO_PI;
          const a = (az * invAz) | 0;
          const g = r < shortBlock ? (r * invShort) | 0 : shortGates + ((r - shortBlock) * invLong) | 0;
          if (g >= nGate || a >= nAz) continue;
          idx[row + px] = a * nGate + g;
        }
      }
      const entry = { idx, w, h };
      viewCache.set(key, entry);
      return entry;
    }

    function raster(moment, tiltIndex, view, frame) {
      markFrame(frame);
      const useTilts = Array.isArray(tiltIndex) ? tiltIndex : [tiltIndex];
      const src = useTilts.length > 1 ? composite(useTilts, frame) : scanAt(useTilts[0], frame);
      const vi = viewIndex(view);
      const w = vi.w;
      const h = vi.h;
      const data = new Uint8ClampedArray(w * h * 4);
      const arr =
        moment === 'v'
          ? src.V
          : moment === 'cc'
          ? src.CC
          : moment === 'ptype'
          ? src.PTYPE
          : moment === 'zdr'
          ? src.ZDR
          : moment === 'width'
          ? src.W
          : src.Z;
      const lut =
        moment === 'ptype'
          ? { lut: WX.palettes.PTYPE_LUT, lo: 0, hi: 255, scale: 1 }
          : WX.palettes.LUTS[moment] || WX.palettes.LUTS.z;
      const idx = vi.idx;
      const scale = lut.scale;
      const lo = lut.lo;
      const n = w * h;
      for (let p = 0; p < n; p += 1) {
        const gi = idx[p];
        if (gi < 0) continue;
        const val = arr[gi];
        if (val <= -900) continue;
        let li = moment === 'ptype' ? val : ((val - lo) * scale) | 0;
        if (li < 0) li = 0;
        else if (li > 255) li = 255;
        const l4 = li * 4;
        const al = lut.lut[l4 + 3];
        if (al === 0) continue;
        const o = p * 4;
        data[o] = lut.lut[l4];
        data[o + 1] = lut.lut[l4 + 1];
        data[o + 2] = lut.lut[l4 + 2];
        data[o + 3] = al;
      }
      return { data, width: w, height: h };
    }

    return {
      site,
      nAz,
      nGate,
      ranges,
      spacing,
      tilts,
      maxRange,
      scanAt,
      composite,
      mrmsGrid,
      raster,
      markFrame,
      clearCache,
      beamSigmaAt: (r) => 0.42 * r * BEAMWIDTH_RAD,
      beamHeight: (r, tiltDeg) =>
        Math.sqrt(r * r + KE_RE * KE_RE + 2 * r * KE_RE * Math.sin(tiltDeg * DEG2RAD)) -
        KE_RE +
        ANTENNA_M,
      PRECIP,
      PRECIP_NAMES,
      NYQUIST,
      get lastCounts() {
        return lastCounts;
      },
    };
  }

  /* --------------------------------------------------------- colour tables
   * Standard NWS digital reflectivity and storm-relative velocity ramps. */
  const Z_STOPS = [
    [5, [4, 2, 33]],
    [10, [2, 48, 124]],
    [15, [2, 100, 160]],
    [20, [0, 170, 170]],
    [25, [0, 190, 70]],
    [30, [0, 214, 5]],
    [35, [0, 255, 0]],
    [40, [200, 255, 0]],
    [45, [255, 224, 0]],
    [50, [255, 145, 0]],
    [55, [255, 0, 0]],
    [60, [200, 0, 0]],
    [65, [160, 0, 130]],
    [70, [255, 255, 255]],
  ];
  const V_STOPS = [
    [-64, [0, 120, 8]],
    [-50, [0, 168, 24]],
    [-36, [2, 224, 4]],
    [-26, [88, 255, 110]],
    [-16, [176, 255, 176]],
    [-8, [222, 255, 222]],
    [-2, [240, 240, 240]],
    [2, [255, 210, 210]],
    [8, [255, 160, 160]],
    [16, [255, 90, 90]],
    [26, [232, 0, 0]],
    [36, [200, 0, 60]],
    [50, [236, 0, 172]],
    [64, [255, 190, 240]],
  ];
  const CC_STOPS = [
    [0.2, [176, 176, 176]],
    [0.5, [120, 0, 180]],
    [0.7, [0, 0, 255]],
    [0.8, [0, 170, 255]],
    [0.85, [0, 220, 160]],
    [0.9, [0, 200, 0]],
    [0.93, [140, 230, 0]],
    [0.95, [255, 230, 0]],
    [0.97, [255, 150, 0]],
    [0.99, [255, 40, 0]],
    [1.0, [220, 0, 60]],
  ];
  const ZDR_STOPS = [
    [-1.5, [140, 140, 140]],
    [-0.5, [60, 60, 200]],
    [0.5, [0, 170, 220]],
    [1.5, [0, 210, 90]],
    [2.5, [180, 240, 0]],
    [3.5, [255, 190, 0]],
    [5, [255, 40, 0]],
  ];
  const W_STOPS = [
    [1, [10, 30, 70]],
    [3, [0, 140, 180]],
    [5, [0, 210, 60]],
    [7, [240, 240, 0]],
    [9, [255, 130, 0]],
    [12, [255, 0, 0]],
  ];
  const PT_COLORS = [
    [0, 0, 0, 0],
    [30, 160, 255, 215], // rain
    [120, 220, 160, 215], // rain/snow
    [230, 230, 255, 215], // snow
    [255, 60, 60, 235], // hail
    [180, 150, 255, 215], // dry snow
  ];

  /** Build a 256-entry RGBA lookup table over [lo, hi] so rasterising never
   *  has to walk the colour ramp per pixel. */
  function buildLUT(stops, lo, hi, alphaFn) {
    const lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i += 1) {
      const v = lo + ((hi - lo) * i) / 255;
      const c = ramp(stops, v);
      lut[i * 4] = c[0];
      lut[i * 4 + 1] = c[1];
      lut[i * 4 + 2] = c[2];
      lut[i * 4 + 3] = alphaFn ? alphaFn(v) : 225;
    }
    return { lut, lo, hi, scale: 255 / (hi - lo) };
  }

  const LUTS = {
    z: buildLUT(Z_STOPS, 5, 75, (v) => clamp(140 + (v - 5) * 6, 140, 250)),
    v: buildLUT(V_STOPS, -64, 64, () => 225),
    cc: buildLUT(CC_STOPS, 0.2, 1.0, () => 228),
    zdr: buildLUT(ZDR_STOPS, -1.5, 5, () => 218),
    width: buildLUT(W_STOPS, 1, 12, () => 205),
  };
  const PTYPE_LUT = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i += 1) {
    const c = PT_COLORS[i] || PT_COLORS[0];
    PTYPE_LUT[i * 4] = c[0];
    PTYPE_LUT[i * 4 + 1] = c[1];
    PTYPE_LUT[i * 4 + 2] = c[2];
    PTYPE_LUT[i * 4 + 3] = c[3];
  }

  function ramp(stops, v) {
    if (!isFinite(v)) return null;
    if (v <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i += 1) {
      if (v <= stops[i][0]) {
        const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        const a = stops[i - 1][1];
        const b = stops[i][1];
        return [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ];
      }
    }
    return stops[stops.length - 1][1];
  }

  WX.palettes = {
    z(dbz) {
      if (!isFinite(dbz) || dbz < 5) return null;
      const c = ramp(Z_STOPS, dbz);
      return [c[0], c[1], c[2], clamp(140 + (dbz - 5) * 6, 140, 250)];
    },
    v(vv) {
      if (!isFinite(vv)) return null;
      const c = ramp(V_STOPS, vv);
      return [c[0], c[1], c[2], 220];
    },
    cc(v) {
      if (!isFinite(v) || v < 0) return null;
      const c = ramp(CC_STOPS, v);
      return [c[0], c[1], c[2], 225];
    },
    zdr(v) {
      if (!isFinite(v)) return null;
      const c = ramp(ZDR_STOPS, v);
      return [c[0], c[1], c[2], 215];
    },
    width(v) {
      if (!isFinite(v)) return null;
      const c = ramp(W_STOPS, v);
      return [c[0], c[1], c[2], 200];
    },
    ptype(i) {
      const c = PT_COLORS[i | 0] || PT_COLORS[0];
      if (!c[3]) return null;
      return [c[0], c[1], c[2], c[3]];
    },
    LUTS,
    PTYPE_LUT,
    Z_STOPS,
    V_STOPS,
    CC_STOPS,
    ZDR_STOPS,
    W_STOPS,
    PT_COLORS,
    ramp,
  };

  WX.createRadar = createRadar;
})(typeof self !== 'undefined' ? self : globalThis);
