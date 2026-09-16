/* ============================================================================
 * WeatherMax 3 :: app.js
 * Warning-desk front end. Drives wx/engine.js, renders the radar forward
 * operator output plus overlays, and runs the simulation progressively so the
 * desk stays responsive while the model integrates.
 * ========================================================================== */
(function () {
  'use strict';

  const WX = window.WX;
  const { clamp, lerp } = WX;

  /* ──────────────────────────────────────────────────────────── cases */
  const CASES = [
    {
      id: 'ok-supercell',
      name: 'Central OK · Tornado Outbreak',
      site: 'KTLX',
      desc: 'Dryline bulge into central Oklahoma. Extreme instability, strong streamwise shear, low LCLs — discrete supercells with long-track tornadoes.',
      s: { temperature: 88, dewpoint: 70, shear: 55, cape: 3500, helicity: 350, dcape: 1500 },
      bubbles: [{ fx: 0.34, fy: 0.5, r: 14, dT: 2.5, dQv: 1.4e-3 }, { fx: 0.62, fy: 0.34, r: 11, dT: 1.8, dQv: 1.0e-3 }],
    },
    {
      id: 'ks-qlcs',
      name: 'W. Kansas · QLCS / Bow',
      site: 'KDDC',
      desc: 'Strong low-level jet and a sharpening baroclinic zone. A quasi-linear system develops a bow segment with embedded mesovortices.',
      s: { temperature: 82, dewpoint: 68, shear: 70, cape: 2400, helicity: 420, dcape: 900 },
      bubbles: [
        { fx: 0.22, fy: 0.28, r: 13, dT: 2.6, dQv: 1.3e-3 },
        { fx: 0.22, fy: 0.5, r: 13, dT: 2.6, dQv: 1.3e-3 },
        { fx: 0.22, fy: 0.72, r: 13, dT: 2.6, dQv: 1.3e-3 },
      ],
    },
    {
      id: 'tx-microburst',
      name: 'N. Texas · Dry Microburst',
      site: 'KFWS',
      desc: 'High-based storms over a deep dry sub-cloud layer. Large DCAPE, weak low-level moisture — wet and dry downbursts dominate.',
      s: { temperature: 99, dewpoint: 54, shear: 28, cape: 3800, helicity: 60, dcape: 2300 },
      bubbles: [{ fx: 0.45, fy: 0.55, r: 16, dT: 3.0, dQv: 1.6e-3 }],
    },
    {
      id: 'ms-hail',
      name: 'Mississippi · Giant Hail',
      site: 'KDGX',
      desc: 'Elevated mixed layer over a moist boundary layer. Very tall updrafts, hail cores suspended well above the freezing level.',
      s: { temperature: 84, dewpoint: 71, shear: 60, cape: 4400, helicity: 260, dcape: 1100 },
      bubbles: [{ fx: 0.4, fy: 0.45, r: 15, dT: 2.8, dQv: 1.8e-3 }],
    },
    {
      id: 'ne-weak',
      name: 'Nebraska · Marginal Pulse',
      site: 'KUEX',
      desc: 'Capped environment with modest shear. Pulse storms, brief heavy rain, no organized rotation.',
      s: { temperature: 76, dewpoint: 62, shear: 26, cape: 1300, helicity: 90, dcape: 700 },
      bubbles: [{ fx: 0.5, fy: 0.5, r: 11, dT: 1.2, dQv: 0.7e-3 }],
    },
    {
      id: 'fl-squall',
      name: 'Florida · Sea-Breeze Squall',
      site: 'KTBW',
      desc: 'Moist, weakly sheared peninsula convection. Training cells, heavy rain and frequent lightning, minimal hail.',
      s: { temperature: 91, dewpoint: 76, shear: 20, cape: 2900, helicity: 70, dcape: 500 },
      bubbles: [{ fx: 0.42, fy: 0.6, r: 12, dT: 1.3, dQv: 1.6e-3 }, { fx: 0.55, fy: 0.4, r: 10, dT: 1.1, dQv: 1.4e-3 }],
    },
    {
      id: 'co-plains',
      name: 'CO Front Range · LP Supercell',
      site: 'KGLD',
      desc: 'High-elevation, low-precipitation supercell. Enormous hail aloft on a very shallow moist layer.',
      s: { temperature: 86, dewpoint: 48, shear: 50, cape: 2600, helicity: 200, dcape: 1200 },
      bubbles: [{ fx: 0.3, fy: 0.5, r: 14, dT: 2.6, dQv: 0.9e-3 }],
    },
  ];

  /* ───────────────────────────────────────────────────── CAM schemes */
  const MODELS = [
    { id: 'hrrr', name: 'HRRR 3-km', bias: { shiftKm: 6, timingMin: -10, zScale: 1.06, dbzOffset: 2.0, uhScale: 1.25, windScale: 1.1, hailScale: 1.15, qpfScale: 0.9 } },
    { id: 'nam-nest', name: 'NAM 3-km Nest', bias: { shiftKm: -14, timingMin: 20, zScale: 0.94, dbzOffset: -2.0, uhScale: 0.8, windScale: 0.92, hailScale: 0.75, qpfScale: 1.25 } },
    { id: 'nam-fire', name: 'NAM-FIRE 1.3-km', bias: { shiftKm: 4, timingMin: -25, zScale: 1.12, dbzOffset: 3.0, uhScale: 1.45, windScale: 1.18, hailScale: 1.3, qpfScale: 1.05 } },
    { id: 'rap', name: 'RAP 13-km', bias: { shiftKm: -22, timingMin: 35, zScale: 0.82, dbzOffset: -4.0, uhScale: 0.55, windScale: 0.85, hailScale: 0.55, qpfScale: 1.15 } },
    { id: 'spc-day1', name: 'SPC Day-1 Outlook', bias: { shiftKm: 30, timingMin: 60, zScale: 0.7, dbzOffset: -6.0, uhScale: 0.45, windScale: 0.8, hailScale: 0.5, qpfScale: 1.3 } },
  ];
  const MODEL_FIELDS = [
    { id: 'compz', name: 'Composite Refl' },
    { id: 'uh', name: 'Max UH' },
    { id: 'wind10', name: 'Max 10-m Wind' },
    { id: 'hail', name: 'Max Hail' },
    { id: 'qpf', name: 'QPF' },
  ];

  /* ───────────────────────────────────────────────────────── products */
  const PRODUCTS = [
    { id: 'z', name: 'Base Refl', kind: 'radar', tilts: 'single', label: 'Base Reflectivity' },
    { id: 'composite', name: 'Composite Refl', kind: 'radar', tilts: [0, 2, 4, 6], label: 'Composite Reflectivity (MRMS)' },
    { id: 'v', name: 'Velocity', kind: 'radar', tilts: 'single', label: 'Storm Relative Velocity' },
    { id: 'cc', name: 'Correlation Coefficient', kind: 'radar', tilts: 'single', label: 'Correlation Coefficient ρhv' },
    { id: 'ptype', name: 'Precip Type', kind: 'radar', tilts: 'single', label: 'Hydrometeor / Precipitation Type' },
    { id: 'rot', name: 'MRMS Rotation', kind: 'mrms', label: 'MRMS Rotation (coarse composite)' },
    { id: 'qpf', name: 'Precip Accum', kind: 'grid', label: 'Model Precipitation Accumulation' },
    { id: 'sat', name: 'Satellite', kind: 'grid', label: 'Simulated IR Brightness Temperature' },
    { id: 'model', name: 'Model', kind: 'model', label: 'CAM Guidance' },
    { id: 'reports', name: 'Storm Reports', kind: 'grid', label: 'Spotter & Radar Storm Reports' },
  ];

  /* ────────────────────────────────────────────────────────── legends */
  function legendRows(moment) {
    const p = WX.palettes;
    const mk = (stops, lo, hi, unit, n = 7) => {
      const rows = [];
      for (let i = 0; i <= n; i += 1) {
        const v = lo + ((hi - lo) * i) / n;
        const c = p.ramp(stops, v);
        rows.push({ v: v.toFixed(unit === 'dBZ' ? 0 : 2), rgb: `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`, unit });
      }
      return rows;
    };
    if (moment === 'z' || moment === 'composite') return mk(p.Z_STOPS, 5, 70, 'dBZ');
    if (moment === 'v') return mk(p.V_STOPS, -50, 50, 'm/s');
    if (moment === 'cc') return mk(p.CC_STOPS, 0.7, 1.0, '');
    if (moment === 'width') return mk(p.W_STOPS, 1, 12, 'm/s');
    if (moment === 'ptype') {
      return WX.palettes.PT_COLORS.map((c, i) => ({
        v: WX.radarPrecipName ? WX.radarPrecipName(i) : ['None', 'Rain', 'Mix', 'Snow', 'Hail', 'Dry Snow'][i],
        rgb: `rgb(${c[0]},${c[1]},${c[2]})`,
        unit: '',
      })).slice(1);
    }
    if (moment === 'rot') {
      return [0, 0.003, 0.006, 0.01, 0.015, 0.022].map((v) => ({
        v: (v * 1000).toFixed(1),
        rgb: v < 0.005 ? '#123a5c' : v < 0.01 ? '#1f8f4a' : v < 0.016 ? '#e8c31a' : '#ff2d40',
        unit: '×10⁻³ s⁻¹',
      }));
    }
    if (moment === 'qpf') {
      return [0.1, 0.25, 0.5, 1, 2, 4, 8].map((v, i) => ({
        v: v.toFixed(2),
        rgb: ['#0b3a63', '#0f6fa8', '#12b3c9', '#3ddc84', '#e8c31a', '#ff7a18', '#ff2d40'][i],
        unit: 'in',
      }));
    }
    if (moment === 'sat') {
      return [-90, -75, -60, -45, -30, -15, 0].map((v, i) => ({
        v: `${v}`,
        rgb: ['#2b0b3a', '#5a1275', '#8f2ba8', '#c94a9a', '#e0e0e0', '#8fb8d4', '#2a4d66'][i],
        unit: '°C',
      }));
    }
    return [];
  }

  /* ─────────────────────────────────────────────────────────── state */
  const state = {
    engine: null,
    caseId: CASES[0].id,
    product: 'z',
    tilt: 0,
    model: MODELS[0],
    modelField: 'compz',
    siteId: 'KTLX',
    frame: 0,
    playing: false,
    targetFrames: 60,
    running: false,
    seed: 7,
    showWarnings: true,
    showReports: true,
    cursor: null,
  };

  const els = {};
  const $ = (id) => document.getElementById(id);
  function bind() {
    [
      'caseSelect', 'caseDesc', 'caseName', 'simState', 'frameChip', 'siteChip', 'clockChip',
      'inTemp', 'inDewpoint', 'inShear', 'inCape', 'inHelicity', 'inDcape', 'runBtn', 'seedBtn',
      'paramTable', 'soundingCanvas', 'meters', 'weatherCanvas', 'canvasWrap', 'productTabs',
      'tiltSelect', 'modelSelect', 'modelProductSelect', 'productLabel', 'legendBox', 'statusBox',
      'ctxMenu', 'btnStart', 'btnBack', 'btnPlay', 'btnFwd', 'btnEnd', 'timeline', 'cursorReadout',
      'camTable', 'warnList', 'warnCount', 'reportList', 'reportCount', 'stormList',
    ].forEach((k) => { els[k] = $(k); });
  }

  /* ──────────────────────────────────────────────────────── map view */
  const view = { x0: 0, y0: 0, x1: 325, y1: 245, width: 800, height: 600 };
  let ctx = null;
  let dpr = 1;

  function fitView() {
    const e = state.engine;
    if (!e) return;
    const wrap = els.canvasWrap.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(320, Math.floor(wrap.width));
    const ch = Math.max(240, Math.floor(wrap.height));
    els.weatherCanvas.width = Math.floor(cw * dpr);
    els.weatherCanvas.height = Math.floor(ch * dpr);
    view.x0 = 0;
    view.y0 = e.domainKm.h;
    view.x1 = e.domainKm.w;
    view.y1 = 0;
    view.width = Math.floor(cw * dpr);
    view.height = Math.floor(ch * dpr);
    ctx = els.weatherCanvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;
  }

  const kmToPx = (xKm, yKm) => ({
    x: ((xKm - view.x0) / (view.x1 - view.x0)) * view.width,
    y: ((yKm - view.y0) / (view.y1 - view.y0)) * view.height,
  });
  const pxToKm = (px, py) => ({
    x: view.x0 + (px / view.width) * (view.x1 - view.x0),
    y: view.y0 + (py / view.height) * (view.y1 - view.y0),
  });

  /* ──────────────────────────────────────────────────────── engine */
  function buildEngine() {
    const c = CASES.find((k) => k.id === state.caseId) || CASES[0];
    const site = WX.siteById(state.siteId) || WX.RADAR_SITES[0];
    const input = {
      temperature: +els.inTemp.value,
      dewpoint: +els.inDewpoint.value,
      shear: +els.inShear.value,
      cape: +els.inCape.value,
      helicity: +els.inHelicity.value,
      dcape: +els.inDcape.value,
    };
    const dxKm = 5;
    const nx = 65;
    const ny = 49;
    const bubbles = (c.bubbles || []).map((b) => ({
      x: b.fx * nx * dxKm * 1000,
      y: b.fy * ny * dxKm * 1000,
      radius: b.r * 1000,
      dTheta: b.dT,
      dQv: b.dQv,
    }));
    state.engine = WX.createEngine({
      soundingInput: input,
      seed: state.seed,
      bubbles,
      nx,
      ny,
      dxKm,
      nz: 14,
      origin: site,
      maxRangeKm: 160,
      azimuths: 240,
    });
    state.engine.init();
    state.frame = 0;
    els.timeline.max = state.targetFrames;
    updateParamTable();
    drawSounding();
    updateMeters();
    fitView();
  }

  /* ──────────────────────────────────────────────── progressive solve */
  let solveTimer = null;
  function runSimulation() {
    if (state.running) return;
    state.running = true;
    setSimState('running', 'SIMULATING');
    const tick = () => {
      const e = state.engine;
      if (!e || !state.running) return;
      if (e.frames.length > state.targetFrames) {
        state.running = false;
        setSimState('', 'COMPLETE');
        els.statusBox.textContent = `Integrated ${e.frames.length} frames · ${e.simMinutes} min of model time`;
        render();
        return;
      }
      const t0 = performance.now();
      e.step();
      const cost = performance.now() - t0;
      els.statusBox.textContent = `Integrating frame ${e.frames.length}/${state.targetFrames + 1} · ${cost.toFixed(0)} ms/frame`;
      if (!state.playing) state.frame = e.frames.length - 1;
      els.timeline.value = state.frame;
      updateFrameChip();
      render();
      solveTimer = setTimeout(tick, 0);
    };
    tick();
  }

  function setSimState(cls, text) {
    els.simState.className = `chip chip-state ${cls}`;
    els.simState.textContent = text;
  }

  /* ──────────────────────────────────────────────────────── render */
  let imgBuf = null;
  function render() {
    const e = state.engine;
    if (!e || !ctx) return;
    const frame = e.frames[clamp(state.frame, 0, e.frames.length - 1)];
    if (!frame) return;
    const prod = PRODUCTS.find((p) => p.id === state.product) || PRODUCTS[0];
    const t0 = performance.now();
    ctx.fillStyle = '#05090d';
    ctx.fillRect(0, 0, view.width, view.height);

    const moment = radarMoment(prod);
    if (moment && prod.kind === 'radar') {
      paintRadar(prod, moment, frame);
    } else if (prod.kind === 'mrms') {
      paintMrmsRotation(frame);
    } else if (prod.id === 'qpf') {
      paintGrid(frame, (g) => (g.rainAccum[i_of(g)] + g.snowAccum[i_of(g)]) / 25.4, qpfColor, 0);
    } else if (prod.id === 'sat') {
      paintSatellite(frame);
    } else if (prod.id === 'reports') {
      // faint grey-scale reflectivity backdrop so report positions have context
      paintGrid(
        frame,
        (g) => 10 * Math.log10(Math.max(g.maxReflectivity[i_of_target], 1e-6)),
        (v) => {
          if (v < 10) return null;
          const t = clamp((v - 10) / 55, 0, 1);
          const g = 40 + 120 * t;
          return [g * 0.8, g * 0.88, g, 70 + 90 * t];
        },
        10,
      );
    } else if (prod.kind === 'model') {
      paintModel(frame);
    }

    drawGeography();
    if (state.product !== 'reports') drawStormStructure(frame);
    if (state.showWarnings) drawWarnings(frame);
    if (state.showReports) drawReports(frame);
    drawTornadoes(frame);
    drawSite();
    els.productLabel.textContent = prod.label + (prod.kind === 'radar' ? ` · ${e.radar.tilts[state.tilt].toFixed(1)}°` : '');
    drawLegend(prod);
    prewarm(frame.index + 1);
    const ms = performance.now() - t0;
    if (!state.running) els.statusBox.textContent = `Rendered in ${ms.toFixed(0)} ms · frame ${frame.index + 1}/${e.frames.length}`;
    updateFrameChip();
  }

  let i_of_target = 0;
  function i_of() {
    return i_of_target;
  }

  function radarMoment(prod) {
    if (prod.id === 'z' || prod.id === 'composite') return 'z';
    if (prod.id === 'v') return 'v';
    if (prod.id === 'cc') return 'cc';
    if (prod.id === 'ptype') return 'ptype';
    return null;
  }

  function paintRadar(prod, moment, frame) {
    const e = state.engine;
    e.radar.markFrame(frame.index);
    const tilts = prod.tilts === 'single' ? [state.tilt] : prod.tilts;
    const out = e.radar.raster(moment, tilts, view, frame.index);
    blit(out);
  }

  function blit(out) {
    if (!imgBuf || imgBuf.width !== out.width || imgBuf.height !== out.height) {
      imgBuf = ctx.createImageData(out.width, out.height);
    }
    imgBuf.data.set(out.data);
    ctx.putImageData(imgBuf, 0, 0);
  }

  function paintMrmsRotation(frame) {
    const e = state.engine;
    e.radar.markFrame(frame.index);
    const m = e.radar.mrmsGrid([0, 4], frame.index, 3);
    const step = m.step;
    ctx.save();
    for (let j = 0; j < m.h; j += 1) {
      for (let i = 0; i < m.w; i += 1) {
        const o = j * m.w + i;
        const rv = m.rotVel[o];
        if (m.Z[o] < 20 || rv < 8) continue;
        const shear = m.shear[o];
        const rot = m.rot[o];
        const strength = clamp((shear - 8) / 22, 0, 1); // shear in m/s
        const p0 = kmToPx((i * step) / 1000, (j * step) / 1000);
        const p1 = kmToPx(((i + 1) * step) / 1000, ((j + 1) * step) / 1000);
        // azimuthal shear thresholds: 5 / 10 / 15 x10^-3 s-1
        const col = rot > 0.015 ? `rgba(255,45,64,${0.25 + 0.65 * strength})` : rot > 0.01 ? `rgba(232,195,26,${0.2 + 0.6 * strength})` : `rgba(31,143,74,${0.18 + 0.5 * strength})`;
        ctx.fillStyle = col;
        ctx.fillRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x) + 1, Math.abs(p1.y - p0.y) + 1);
      }
    }
    ctx.restore();
  }

  function paintGrid(frame, valueFn, colorFn, minVal) {
    const e = state.engine;
    const g = frame.grid;
    const w = view.width;
    const h = view.height;
    if (!imgBuf || imgBuf.width !== w || imgBuf.height !== h) imgBuf = ctx.createImageData(w, h);
    const data = imgBuf.data;
    data.fill(0);
    const nx = e.grid.nx;
    const ny = e.grid.ny;
    const kmW = e.domainKm.w;
    const kmH = e.domainKm.h;
    for (let py = 0; py < h; py += 1) {
      const yKm = view.y0 + ((py + 0.5) / h) * (view.y1 - view.y0);
      const j = clamp(Math.floor((yKm / kmH) * ny), 0, ny - 1);
      for (let px = 0; px < w; px += 1) {
        const xKm = view.x0 + ((px + 0.5) / w) * (view.x1 - view.x0);
        const i = clamp(Math.floor((xKm / kmW) * nx), 0, nx - 1);
        i_of_target = j * nx + i;
        const v = valueFn(g);
        if (v < minVal) continue;
        const c = colorFn(v, g);
        if (!c) continue;
        const o = (py * w + px) * 4;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = c[3];
      }
    }
    ctx.putImageData(imgBuf, 0, 0);
  }

  const QPF_STOPS = [
    [0.05, [11, 58, 99]],
    [0.25, [15, 111, 168]],
    [0.5, [18, 179, 201]],
    [1, [61, 220, 132]],
    [2, [232, 195, 26]],
    [4, [255, 122, 24]],
    [8, [255, 45, 64]],
  ];
  function qpfColor(v) {
    const c = WX.palettes.ramp(QPF_STOPS, v);
    return [c[0], c[1], c[2], clamp(90 + v * 40, 90, 235)];
  }

  const SAT_STOPS = [
    [-95, [43, 11, 58]],
    [-75, [90, 18, 117]],
    [-60, [143, 43, 168]],
    [-45, [201, 74, 154]],
    [-32, [224, 224, 224]],
    [-18, [143, 184, 212]],
    [-5, [42, 77, 102]],
  ];
  function paintSatellite(frame) {
    paintGrid(
      frame,
      (g) => satTb(g.cloudTop[i_of_target]),
      (tb) => {
        const c = WX.palettes.ramp(SAT_STOPS, tb);
        const a = tb < -18 ? 245 : 150;
        return [c[0], c[1], c[2], a];
      },
      -999,
    );
  }
  function satTb(cloudTopM) {
    if (cloudTopM < 300) return 12;
    // temperature at cloud top from a standard tropospheric lapse profile,
    // with a cold overshoot for very tall towers
    const t = state.engine.sounding;
    const s = t.at(cloudTopM);
    let tb = s ? s.T - 273.15 : -40;
    if (cloudTopM > 11500) tb -= Math.min(14, (cloudTopM - 11500) / 220);
    return tb;
  }

  function paintModel(frame) {
    const e = state.engine;
    const field = e.modelField(state.model, state.modelField);
    const specs = {
      compz: { min: 5, fn: (v) => { const c = WX.palettes.ramp(WX.palettes.Z_STOPS, v); return [c[0], c[1], c[2], 200]; } },
      uh: { min: 25, fn: (v) => { const t = clamp((v - 25) / 400, 0, 1); return [40 + 215 * t, 160 - 90 * t, 220 - 150 * t, 120 + 120 * t]; } },
      wind10: { min: 25, fn: (v) => { const t = clamp((v - 25) / 75, 0, 1); return [60 + 195 * t, 180 - 100 * t, 230 - 190 * t, 110 + 130 * t]; } },
      hail: { min: 0.5, fn: (v) => { const t = clamp((v - 0.5) / 3.5, 0, 1); return [60 + 195 * t, 220 - 130 * t, 90 - 40 * t, 120 + 125 * t]; } },
      qpf: { min: 0.05, fn: (v) => qpfColor(v) },
    };
    const spec = specs[state.modelField] || specs.compz;
    const nx = e.grid.nx;
    paintGrid(
      { grid: { model: field } },
      () => field[i_of_target],
      spec.fn,
      spec.min,
    );
    // smooth the coarse model output a touch so it reads like guidance
    ctx.globalAlpha = 1;
  }

  /* Compute the next frame's radar scan during idle time so stepping through
   * the loop never stalls on the forward operator. */
  let prewarmTimer = null;
  function prewarm(nextIndex) {
    const e = state.engine;
    if (!e || nextIndex >= e.frames.length) return;
    const prod = PRODUCTS.find((p) => p.id === state.product) || PRODUCTS[0];
    if (prod.kind !== 'radar') return;
    if (prewarmTimer) clearTimeout(prewarmTimer);
    prewarmTimer = setTimeout(() => {
      if (state.frame === nextIndex) return;
      e.radar.markFrame(nextIndex);
      const tilts = prod.tilts === 'single' ? [state.tilt] : prod.tilts;
      for (const t of tilts) e.radar.scanAt(t, nextIndex);
      e.radar.markFrame(clamp(state.frame, 0, e.frames.length - 1));
    }, 30);
  }

  /* ────────────────────────────────────────────────── map decorations */
  function drawGeography() {
    const e = state.engine;
    const proj = e.proj || (e.proj = WX.makeProjection(e.site.lat, e.site.lon));
    ctx.save();
    ctx.lineWidth = 1;
    // graticule
    ctx.strokeStyle = 'rgba(90,120,145,0.22)';
    ctx.font = `${9 * dpr}px var(--mono), monospace`;
    ctx.fillStyle = 'rgba(140,168,190,0.55)';
    const c0 = proj.toLatLon(0, 0);
    for (let dLat = Math.ceil(c0.lat - 3); dLat < c0.lat + 3.5; dLat += 1) {
      const y = kmToPx(0, proj.toXY(dLat, e.site.lon).y).y;
      if (y < 0 || y > view.height) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(view.width, y);
      ctx.stroke();
      ctx.fillText(`${dLat}°N`, 5 * dpr, y - 3 * dpr);
    }
    for (let dLon = Math.floor(c0.lon) - 3; dLon < c0.lon + 3.5; dLon += 1) {
      const x = kmToPx(proj.toXY(e.site.lat, dLon).x, 0).x;
      if (x < 0 || x > view.width) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, view.height);
      ctx.stroke();
      ctx.fillText(`${Math.abs(dLon)}°W`, x + 3 * dpr, 11 * dpr);
    }
    // range rings
    const s = kmToPx(e.domainKm.w / 2, e.domainKm.h / 2);
    ctx.strokeStyle = 'rgba(120,150,175,0.3)';
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    for (const r of [50, 100, 150]) {
      const px = (r / (view.x1 - view.x0)) * view.width;
      const py = (r / Math.abs(view.y1 - view.y0)) * view.height;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, px, py, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(160,190,215,0.6)';
      ctx.fillText(`${r} km`, s.x + px * 0.71 + 3 * dpr, s.y - py * 0.71);
    }
    ctx.setLineDash([]);
    // nearby radar sites
    for (const site of WX.RADAR_SITES) {
      if (site.id === e.site.id) continue;
      const p = proj.toXY(site.lat, site.lon);
      const px = kmToPx(p.x + e.domainKm.w / 2, p.y + e.domainKm.h / 2);
      if (px.x < -20 || px.y < -20 || px.x > view.width + 20 || px.y > view.height + 20) continue;
      ctx.fillStyle = 'rgba(190,215,235,0.85)';
      ctx.beginPath();
      ctx.arc(px.x, px.y, 2.4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(190,215,235,0.7)';
      ctx.font = `${9 * dpr}px var(--mono), monospace`;
      ctx.fillText(site.id, px.x + 4 * dpr, px.y + 3 * dpr);
    }
    ctx.restore();
  }

  function drawSite() {
    const e = state.engine;
    const p = kmToPx(e.site.x / 1000, e.site.y / 1000);
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6 * dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 10 * dpr, p.y);
    ctx.lineTo(p.x + 10 * dpr, p.y);
    ctx.moveTo(p.x, p.y - 10 * dpr);
    ctx.lineTo(p.x, p.y + 10 * dpr);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${11 * dpr}px var(--sans), sans-serif`;
    ctx.fillText(e.site.id, p.x + 12 * dpr, p.y - 8 * dpr);
    ctx.restore();
  }

  function drawStormStructure(frame) {
    ctx.save();
    for (const el of frame.elements) {
      const p = kmToPx(el.x / 1000, el.y / 1000);
      const meso = Math.abs(el.zetaLow) > 0.004;
      const r = (meso ? 7 : 4.5) * dpr;
      ctx.strokeStyle = meso ? 'rgba(255,215,64,0.95)' : 'rgba(140,205,255,0.8)';
      ctx.lineWidth = (meso ? 1.8 : 1.2) * dpr;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (meso) {
        // rotation arrow
        const dir = el.rotationSign || 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4 * dpr, dir > 0 ? -0.6 : Math.PI - 0.6, dir > 0 ? 1.5 : Math.PI + 1.5, dir < 0);
        ctx.stroke();
      }
      if (el.tornado) {
        ctx.fillStyle = '#ff2d40';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // system outlines
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.strokeStyle = 'rgba(255,180,84,0.5)';
    ctx.lineWidth = 1 * dpr;
    for (const sy of frame.systems) {
      if (sy.type === 'pulse' || sy.members < 2) continue;
      const p = kmToPx(sy.x / 1000, sy.y / 1000);
      const rx = (sy.length / 2 / (view.x1 - view.x0)) * view.width;
      const ry = rx * 0.55;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, Math.max(8, rx), Math.max(6, ry), -sy.angle, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,180,84,0.85)';
      ctx.font = `${9.5 * dpr}px var(--sans), sans-serif`;
      ctx.fillText(sy.type.toUpperCase(), p.x + Math.max(8, rx) + 4 * dpr, p.y + 3 * dpr);
      ctx.setLineDash([3 * dpr, 3 * dpr]);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawTornadoes(frame) {
    ctx.save();
    for (const t of frame.tornadoes) {
      if (!t.path || t.path.length < 1) continue;
      // one contiguous swath per tornado, segmented by intensity
      for (let i = 1; i < t.path.length; i += 1) {
        const a = kmToPx(t.path[i - 1].x / 1000, t.path[i - 1].y / 1000);
        const b = kmToPx(t.path[i].x / 1000, t.path[i].y / 1000);
        const ef = t.path[i].ef;
        ctx.strokeStyle = ef >= 4 ? '#b46cff' : ef >= 2 ? '#ff2d40' : '#ff9a1f';
        ctx.globalAlpha = t.active ? 0.95 : 0.55;
        ctx.lineWidth = clamp(1.5 + ef * 1.4, 1.5, 8) * dpr;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (t.active && t.x !== undefined) {
        const p = kmToPx(t.x / 1000, t.y / 1000);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${10 * dpr}px var(--sans), sans-serif`;
        ctx.fillText(`EF${t.ef}`, p.x + 8 * dpr, p.y - 6 * dpr);
      }
    }
    ctx.restore();
  }

  function drawWarnings(frame) {
    ctx.save();
    for (const w of frame.warnings) {
      const pts = w.polygon.map((p) => kmToPx(p.x / 1000, p.y / 1000));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = w.kind === 'tornado' ? 'rgba(255,45,64,0.22)' : w.kind === 'flash' ? 'rgba(139,195,74,0.2)' : 'rgba(255,160,0,0.18)';
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 1.6 * dpr;
      ctx.fill();
      ctx.stroke();
      const c = kmToPx(w.x / 1000, w.y / 1000);
      ctx.fillStyle = w.color;
      ctx.font = `bold ${10 * dpr}px var(--sans), sans-serif`;
      const tagLabel = w.tag === 'catastrophic' ? 'TE' : w.tag === 'considerable' ? (w.kind === 'tornado' ? 'PDS' : 'CONS') : w.tag === 'destructive' ? 'DESTR' : '';
      ctx.fillText(`${WARN_PIL(w)}${tagLabel ? ' · ' + tagLabel : ''}`, c.x - 14 * dpr, c.y);
    }
    ctx.restore();
  }
  function WARN_PIL(w) {
    return w.kind === 'tornado' ? 'TOR' : w.kind === 'flash' ? 'FFW' : 'SVR';
  }

  function drawReports(frame) {
    ctx.save();
    const icons = {
      wind_damage: ['A', '#4f8cff'],
      wind_gust: ['a', '#7fb0ff'],
      wind_gust_sig: ['A', '#1e5fd0'],
      hail: ['•', '#3ddc84'],
      hail_sig: ['•', '#0f8f4a'],
      tornado: ['T', '#ff9a1f'],
      tornado_sig: ['T', '#ff2d40'],
    };
    for (const r of frame.reports) {
      const p = kmToPx(r.x / 1000, r.y / 1000);
      const ic = icons[r.type] || ['?', '#ccc'];
      ctx.fillStyle = ic[1];
      ctx.font = `bold ${(r.significant ? 11 : 9.5) * dpr}px var(--sans), sans-serif`;
      ctx.fillText(ic[0], p.x - 3 * dpr, p.y + 3 * dpr);
    }
    ctx.restore();
  }

  function drawLegend(prod) {
    const moment = radarMoment(prod) || (prod.kind === 'mrms' ? 'rot' : prod.id);
    const rows = legendRows(moment);
    if (!rows.length) {
      els.legendBox.innerHTML = '';
      return;
    }
    els.legendBox.innerHTML = rows
      .map((r) => `<div class="lg-row"><span class="lg-bar" style="width:14px;background:${r.rgb}"></span>${r.v}${r.unit ? ' ' + r.unit : ''}</div>`)
      .reverse()
      .join('');
  }

  /* ──────────────────────────────────────────────────────── panels */
  function updateParamTable() {
    const m = state.engine.sounding.metrics;
    const rows = [
      ['MLCAPE', `${Math.round(m.cape)} J/kg`],
      ['CIN', `${Math.round(m.cin)} J/kg`],
      ['LCL', `${Math.round(m.lcl)} m`],
      ['DCAPE', `${Math.round(m.dcape)} J/kg`],
      ['0–1 SRH', `${Math.round(m.srh01)} m²/s²`],
      ['0–3 SRH', `${Math.round(m.srh03)} m²/s²`],
      ['0–6 shear', `${m.shear06.toFixed(0)} kt`],
      ['700–500 LR', `${m.lapse700500.toFixed(1)} K/km`],
      ['Freezing lvl', `${(m.freezing / 1000).toFixed(1)} km`],
      ['Wet bulb 0', m.wbz ? `${(m.wbz / 1000).toFixed(1)} km` : '—'],
      ['PWAT', `${m.pwat.toFixed(2)} in`],
      ['Sig Tornado P', `<b>${m.stp.toFixed(1)}</b>`],
      ['Sig Severe P', `${m.scp.toFixed(1)}`],
      ['Storm motion', `${m.motion.speed.toFixed(0)} m/s @ ${m.motion.met.toFixed(0)}°`],
    ];
    els.paramTable.innerHTML = rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
  }

  function updateMeters() {
    const frame = state.engine.frames[clamp(state.frame, 0, state.engine.frames.length - 1)];
    const st = frame ? frame.stats : { maxW: 0, maxDbz: -99, maxGustMph: 0, maxHailIn: 0, maxPrcpMm: 0, maxUH: 0 };
    const defs = [
      ['Max updraft', st.maxW.toFixed(0) + ' m/s', clamp(st.maxW / 45, 0, 1), '#38bdf8'],
      ['Max reflectivity', st.maxDbz.toFixed(0) + ' dBZ', clamp((st.maxDbz - 10) / 60, 0, 1), '#3ddc84'],
      ['Peak gust', st.maxGustMph.toFixed(0) + ' mph', clamp((st.maxGustMph - 30) / 70, 0, 1), '#ffb020'],
      ['MESH', st.maxHailIn.toFixed(2) + ' in', clamp(st.maxHailIn / 4, 0, 1), '#ff7a18'],
      ['Max updraft helicity', st.maxUH.toFixed(0) + ' m²/s²', clamp(st.maxUH / 400, 0, 1), '#b46cff'],
      ['Max accum', st.maxPrcpMm.toFixed(1) + ' mm', clamp(st.maxPrcpMm / 80, 0, 1), '#4f8cff'],
    ];
    els.meters.innerHTML = defs
      .map(
        (d) => `<div class="meter"><div class="m-head"><span>${d[0]}</span><b>${d[1]}</b></div>
      <div class="m-bar"><div class="m-fill" style="width:${(d[2] * 100).toFixed(0)}%;background:${d[3]}"></div></div></div>`,
      )
      .join('');
  }

  function updateCamTable() {
    const frame = state.engine.frames[clamp(state.frame, 0, state.engine.frames.length - 1)];
    if (!frame) return;
    const e = state.engine;
    const rows = MODELS.map((m) => {
      const field = e.modelField(m, state.modelField);
      let mx = -Infinity;
      for (let i = 0; i < field.length; i += 1) if (field[i] > mx) mx = field[i];
      const on = m.id === state.model.id;
      const unit = state.modelField === 'wind10' ? ' mph' : state.modelField === 'hail' ? ' in' : state.modelField === 'qpf' ? ' in' : state.modelField === 'uh' ? '' : ' dBZ';
      return `<tr><td${on ? ' style="color:#ffb020"' : ''}>${m.name}</td><td>${mx.toFixed(state.modelField === 'compz' || state.modelField === 'uh' ? 0 : 1)}${unit}</td></tr>`;
    });
    els.camTable.innerHTML = rows.join('');
  }

  function updateWarnList() {
    const frame = state.engine.frames[clamp(state.frame, 0, state.engine.frames.length - 1)];
    if (!frame) return;
    els.warnCount.textContent = frame.warnings.length;
    if (!frame.warnings.length) {
      els.warnList.innerHTML = '<p class="empty">No active warnings.</p>';
      return;
    }
    els.warnList.innerHTML = frame.warnings
      .slice()
      .sort((a, b) => b.severity - a.severity)
      .map((w) => {
        const d = w.detail || {};
        const detail =
          w.kind === 'tornado'
            ? `EF${d.ef || 0} · ${d.mph || 105} mph · ${(w.remaining || 0).toFixed(0)} min left`
            : w.kind === 'flash'
            ? `${(d.inches || 0).toFixed(1)} in · ${(w.remaining || 0).toFixed(0)} min left`
            : `${(d.windMph || 0).toFixed(0)} mph · ${(d.hailIn || 0).toFixed(2)} in · ${(w.remaining || 0).toFixed(0)} min left`;
        return `<div class="warn-item ${w.kind}"><div class="w-head"><span>${d.headline || w.name}</span><span class="w-tag ${w.tag}">${w.tag}</span></div>
        <div class="w-meta">${w.id} · ${detail} · ${w.storms} storm${w.storms > 1 ? 's' : ''}</div></div>`;
      })
      .join('');
  }

  function updateReportList() {
    const frame = state.engine.frames[clamp(state.frame, 0, state.engine.frames.length - 1)];
    if (!frame) return;
    els.reportCount.textContent = frame.reports.length;
    if (!frame.reports.length) {
      els.reportList.innerHTML = '<p class="empty">No reports received.</p>';
      return;
    }
    const icons = { wind_damage: 'A', wind_gust: 'a', wind_gust_sig: 'A', hail: '•', hail_sig: '•', tornado: 'T', tornado_sig: 'T' };
    els.reportList.innerHTML = frame.reports
      .slice()
      .reverse()
      .slice(0, 60)
      .map((r) => {
        const hh = Math.floor(r.minutes / 60);
        const mm = r.minutes % 60;
        const val = r.unit === 'mph' ? `${r.value} mph` : r.unit === 'in' ? `${Number(r.value).toFixed(2)} in` : r.value;
        return `<div class="report-item ${r.significant ? 'sig' : ''}"><span class="r-ico">${icons[r.type] || '·'}</span>
        <span class="r-body"><span class="r-txt">${r.text}</span><span class="r-val">T+${hh}:${String(mm).padStart(2, '0')} · ${val} · ${r.label}</span></span></div>`;
      })
      .join('');
  }

  function updateStormList() {
    const frame = state.engine.frames[clamp(state.frame, 0, state.engine.frames.length - 1)];
    if (!frame) return;
    if (!frame.elements.length) {
      els.stormList.innerHTML = '<p class="empty">No convection.</p>';
      return;
    }
    const list = frame.elements.slice().sort((a, b) => Math.abs(b.zetaLow) - Math.abs(a.zetaLow)).slice(0, 10);
    els.stormList.innerHTML = list
      .map((el) => {
        const rotV = Math.abs(el.zetaLow) * 3600 * 0.5 * 1.94384;
        return `<div class="storm-item"><span class="s-name">Cell ${String(el.id).padStart(2, '0')}</span>
        <span class="s-stat">w ${el.w.toFixed(0)} m/s</span>
        <span class="s-type">${el.type}${el.tornado ? ' · TOR EF' + el.tornado.ef : ''}</span>
        <span class="s-stat">${rotV.toFixed(0)} kt · ${(el.hailSize / 0.0254).toFixed(2)} in</span></div>`;
      })
      .join('');
  }

  function updateFrameChip() {
    const e = state.engine;
    const frame = e.frames[clamp(state.frame, 0, e.frames.length - 1)];
    if (!frame) return;
    const h = Math.floor(frame.minutes / 60);
    const m = frame.minutes % 60;
    els.frameChip.textContent = `T+${h}:${String(m).padStart(2, '0')}`;
    const zHour = 21 + Math.floor((frame.minutes + 30) / 60);
    const zMin = (frame.minutes + 30) % 60;
    els.clockChip.textContent = `${String(zHour % 24).padStart(2, '0')}:${String(zMin).padStart(2, '0')}Z`;
    updateMeters();
    updateWarnList();
    updateReportList();
    updateStormList();
    updateCamTable();
  }

  /* ───────────────────────────────────────────────── sounding canvas */
  function drawSounding() {
    const cv = els.soundingCanvas;
    const c = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#080e14';
    c.fillRect(0, 0, W, H);
    const snd = state.engine.sounding;
    const p = snd.profile;
    const tMin = -40;
    const tMax = 45;
    const zMax = 16000;
    const X = (t) => ((t - tMin) / (tMax - tMin)) * (W - 22) + 18;
    const Y = (z) => H - 14 - (z / zMax) * (H - 26);
    // isotherms
    c.strokeStyle = 'rgba(90,120,145,0.18)';
    c.lineWidth = 1;
    c.font = '8px monospace';
    c.fillStyle = 'rgba(140,168,190,0.5)';
    for (let t = -40; t <= 40; t += 20) {
      c.beginPath();
      c.moveTo(X(t), Y(0));
      c.lineTo(X(t), Y(zMax));
      c.stroke();
      c.fillText(`${t}`, X(t) - 6, H - 4);
    }
    for (let z = 0; z <= 16000; z += 4000) {
      c.beginPath();
      c.moveTo(18, Y(z));
      c.lineTo(W - 4, Y(z));
      c.stroke();
      c.fillText(`${z / 1000}k`, 2, Y(z) + 3);
    }
    // temperature profile
    c.strokeStyle = '#ff5c5c';
    c.lineWidth = 1.8;
    c.beginPath();
    for (let k = 0; k < p.z.length; k += 1) {
      const x = X(p.T[k] - 273.15);
      const y = Y(p.z[k]);
      if (k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    // dewpoint
    c.strokeStyle = '#5ad1ff';
    c.beginPath();
    for (let k = 0; k < p.z.length; k += 1) {
      const td = WX.dewpointFromQ(p.qv[k], p.p[k]);
      const x = X(td);
      const y = Y(p.z[k]);
      if (k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    // parcel path
    const m = snd.metrics;
    if (m.parcelT) {
      c.strokeStyle = '#ffb454';
      c.setLineDash([3, 2]);
      c.beginPath();
      let started = false;
      for (let k = 0; k < m.parcelT.length; k += 1) {
        const x = X(m.parcelT[k] - 273.15);
        const y = Y(Math.min(zMax, k * 200));
        if (!started) {
          c.moveTo(x, y);
          started = true;
        } else c.lineTo(x, y);
      }
      c.stroke();
      c.setLineDash([]);
    }
    // hodograph inset
    const hx = W - 56;
    const hy = 56;
    const hr = 40;
    c.strokeStyle = 'rgba(90,120,145,0.35)';
    c.beginPath();
    c.arc(hx, hy, hr, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(hx, hy, hr * 0.5, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = '#5ad1ff';
    c.lineWidth = 1.5;
    c.beginPath();
    for (let z = 0; z <= 6300; z += 300) {
      const wv = snd.windAt(z);
      const x = hx + (wv.u / 35) * hr;
      const y = hy - (wv.v / 35) * hr;
      if (z === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    // storm-relative motion vector
    const mo = snd.metrics.motion;
    c.fillStyle = '#ffb454';
    c.beginPath();
    c.arc(hx + (mo.u / 35) * hr, hy - (mo.v / 35) * hr, 2.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(140,168,190,0.6)';
    c.fillText('6 km', hx + hr + 2, hy - hr + 6);
  }

  /* ──────────────────────────────────────────────────────── UI wiring */
  function buildProductTabs() {
    els.productTabs.innerHTML = PRODUCTS.map(
      (p) => `<button class="tab ${p.id === state.product ? 'on' : ''}" data-p="${p.id}">${p.name}</button>`,
    ).join('');
    els.productTabs.querySelectorAll('.tab').forEach((b) =>
      b.addEventListener('click', () => {
        state.product = b.dataset.p;
        buildProductTabs();
        render();
      }),
    );
  }

  function buildTilts() {
    const e = state.engine;
    els.tiltSelect.innerHTML = e.radar.tilts
      .map((t, i) => `<option value="${i}" ${i === state.tilt ? 'selected' : ''}>${t.toFixed(1)}°</option>`)
      .join('');
  }

  function buildCases() {
    els.caseSelect.innerHTML = CASES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  function buildModelSelects() {
    els.modelSelect.innerHTML = MODELS.map((m) => `<option value="${m.id}" ${m.id === state.model.id ? 'selected' : ''}>${m.name}</option>`).join('');
    els.modelProductSelect.innerHTML = MODEL_FIELDS.map((f) => `<option value="${f.id}" ${f.id === state.modelField ? 'selected' : ''}>${f.name}</option>`).join('');
  }

  function loadCase(id, rebuild) {
    const c = CASES.find((k) => k.id === id) || CASES[0];
    state.caseId = c.id;
    state.siteId = c.site;
    els.caseDesc.textContent = c.desc;
    els.caseName.textContent = c.name;
    els.siteChip.textContent = `${c.site} · ${(WX.siteById(c.site) || {}).name || ''}`;
    if (rebuild !== false) {
      els.inTemp.value = c.s.temperature;
      els.inDewpoint.value = c.s.dewpoint;
      els.inShear.value = c.s.shear;
      els.inCape.value = c.s.cape;
      els.inHelicity.value = c.s.helicity;
      els.inDcape.value = c.s.dcape;
    }
    buildEngine();
    buildTilts();
    runSimulation();
  }

  /* ─────────────────────────────────────────────── context menu (RMB) */
  function showContextMenu(ev) {
    ev.preventDefault();
    const rect = els.canvasWrap.getBoundingClientRect();
    const px = (ev.clientX - rect.left) * dpr;
    const py = (ev.clientY - rect.top) * dpr;
    const km = pxToKm(px, py);
    const e = state.engine;
    const proj = WX.makeProjection(e.site.lat, e.site.lon);
    const ll = proj.toLatLon(km.x - e.domainKm.w / 2, km.y - e.domainKm.h / 2);
    const range = Math.hypot(km.x - e.site.x / 1000, km.y - e.site.y / 1000);
    const bearing = (Math.atan2(km.x - e.site.x / 1000, km.y - e.site.y / 1000) * 180) / Math.PI;
    const near = WX.nearestSites(ll.lat, ll.lon, 6).map((n) => ({ ...n.site, distance: n.km }));
    const menu = els.ctxMenu;
    menu.innerHTML = `
      <div class="ctx-label">Coordinates</div>
      <div class="ctx-item" data-act="copy-ll"><span>${ll.lat.toFixed(4)}°, ${ll.lon.toFixed(4)}°</span><span class="k">copy</span></div>
      <div class="ctx-item" data-act="copy-rb"><span>${range.toFixed(1)} km @ ${((bearing + 360) % 360).toFixed(0)}° from ${e.site.id}</span><span class="k">copy</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-label">Switch radar site</div>
      ${near.map((s) => `<div class="ctx-item" data-act="site" data-id="${s.id}"><span>${s.id} — ${s.city}, ${s.state}</span><span class="k">${s.distance ? s.distance.toFixed(0) + ' km' : ''}</span></div>`).join('')}
      <div class="ctx-sep"></div>
      <div class="ctx-item" data-act="all-sites"><span>Browse all ${WX.RADAR_SITES.length} sites…</span><span class="k">↵</span></div>
    `;
    menu.hidden = false;
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    menu.style.left = `${Math.min(ev.clientX - rect.left, rect.width - mw - 6)}px`;
    menu.style.top = `${Math.min(ev.clientY - rect.top, rect.height - mh - 6)}px`;
    menu.onclick = (e2) => {
      const item = e2.target.closest('.ctx-item');
      if (!item) return;
      const act = item.dataset.act;
      if (act === 'copy-ll') copyText(`${ll.lat.toFixed(4)}, ${ll.lon.toFixed(4)}`);
      else if (act === 'copy-rb') copyText(`${range.toFixed(1)} km @ ${((bearing + 360) % 360).toFixed(0)}° from ${e.site.id} (${ll.lat.toFixed(4)}, ${ll.lon.toFixed(4)})`);
      else if (act === 'site') switchSite(item.dataset.id);
      else if (act === 'all-sites') showAllSites();
      menu.hidden = true;
    };
  }

  function showAllSites() {
    const menu = els.ctxMenu;
    const grouped = {};
    for (const s of WX.RADAR_SITES) (grouped[s.state || '??'] = grouped[s.state || '??'] || []).push(s);
    const states = Object.keys(grouped).sort();
    menu.innerHTML = `<div class="ctx-label">All WSR-88D sites</div>
      <div style="max-height:300px;overflow:auto">
      ${states
        .map(
          (st) =>
            `<div class="ctx-label">${st}</div>` +
            grouped[st].map((s) => `<div class="ctx-item" data-act="site" data-id="${s.id}"><span>${s.id} — ${s.city}</span><span class="k">${s.elevM} m</span></div>`).join(''),
        )
        .join('')}
      </div>`;
    menu.hidden = false;
    menu.style.left = '20px';
    menu.style.top = '20px';
  }

  function copyText(t) {
    if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
    els.statusBox.textContent = `Copied: ${t}`;
  }

  function switchSite(id) {
    const site = WX.siteById(id);
    if (!site) return;
    state.siteId = id;
    els.siteChip.textContent = `${site.id} · ${site.name}`;
    els.statusBox.textContent = `Re-locating radar to ${site.id} (${site.city}, ${site.state})`;
    buildEngine();
    buildTilts();
    runSimulation();
  }

  /* ───────────────────────────────────────────────────────── boot */
  function boot() {
    bind();
    buildCases();
    buildProductTabs();
    buildModelSelects();

    els.caseSelect.value = state.caseId;
    els.caseSelect.addEventListener('change', (e) => loadCase(e.target.value));
    els.runBtn.addEventListener('click', () => {
      state.seed = (state.seed * 7 + 13) % 100000;
      loadCase(state.caseId, false);
    });
    els.seedBtn.addEventListener('click', () => {
      state.seed = Math.floor(Math.random() * 100000);
      buildEngine();
      runSimulation();
    });
    els.tiltSelect.addEventListener('change', (e) => {
      state.tilt = +e.target.value;
      render();
    });
    els.modelSelect.addEventListener('change', (e) => {
      state.model = MODELS.find((m) => m.id === e.target.value) || MODELS[0];
      render();
    });
    els.modelProductSelect.addEventListener('change', (e) => {
      state.modelField = e.target.value;
      render();
    });

    els.btnPlay.addEventListener('click', () => {
      state.playing = !state.playing;
      els.btnPlay.textContent = state.playing ? '❚❚' : '▶';
      setSimState(state.playing ? 'playing' : state.running ? 'running' : '', state.playing ? 'PLAYING' : state.running ? 'SIMULATING' : 'HOLD');
    });
    els.btnFwd.addEventListener('click', () => {
      state.frame = clamp(state.frame + 1, 0, state.engine.frames.length - 1);
      els.timeline.value = state.frame;
      render();
    });
    els.btnBack.addEventListener('click', () => {
      state.frame = clamp(state.frame - 1, 0, state.engine.frames.length - 1);
      els.timeline.value = state.frame;
      render();
    });
    els.btnStart.addEventListener('click', () => {
      state.frame = 0;
      els.timeline.value = 0;
      render();
    });
    els.btnEnd.addEventListener('click', () => {
      state.frame = state.engine.frames.length - 1;
      els.timeline.value = state.frame;
      render();
    });
    els.timeline.addEventListener('input', (e) => {
      state.frame = clamp(+e.target.value, 0, state.engine.frames.length - 1);
      render();
    });

    els.weatherCanvas.addEventListener('mousemove', (ev) => {
      const rect = els.canvasWrap.getBoundingClientRect();
      const px = (ev.clientX - rect.left) * dpr;
      const py = (ev.clientY - rect.top) * dpr;
      const km = pxToKm(px, py);
      state.cursor = km;
      const s = state.engine.sampleCursor(km.x, km.y);
      const e = state.engine;
      const proj = WX.makeProjection(e.site.lat, e.site.lon);
      const ll = proj.toLatLon(km.x - e.domainKm.w / 2, km.y - e.domainKm.h / 2);
      els.cursorReadout.textContent =
        `${ll.lat.toFixed(3)}° ${ll.lon.toFixed(3)}° · ${s.rangeKm.toFixed(0)} km ${s.bearing.toFixed(0)}° · ${s.T.toFixed(0)}°C/${s.Td.toFixed(0)}°C · wind ${s.windMph.toFixed(0)} mph ${s.windDir.toFixed(0)}° · updraft ${s.updraft.toFixed(0)} m/s · MESH ${s.hailIn.toFixed(2)} in · accum ${(s.rainMm / 25.4).toFixed(2)} in`;
    });
    els.weatherCanvas.addEventListener('contextmenu', showContextMenu);
    document.addEventListener('click', (ev) => {
      if (!els.ctxMenu.contains(ev.target)) els.ctxMenu.hidden = true;
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT') return;
      if (ev.key === ' ') {
        ev.preventDefault();
        els.btnPlay.click();
      } else if (ev.key === 'ArrowRight') els.btnFwd.click();
      else if (ev.key === 'ArrowLeft') els.btnBack.click();
      else if (ev.key >= '1' && ev.key <= '9') {
        const i = +ev.key - 1;
        if (PRODUCTS[i]) {
          state.product = PRODUCTS[i].id;
          buildProductTabs();
          render();
        }
      }
    });

    window.addEventListener('resize', () => {
      fitView();
      render();
    });

    loadCase(state.caseId);

    // playback loop
    let last = 0;
    const loop = (t) => {
      if (state.playing && t - last > 320) {
        last = t;
        const max = state.engine.frames.length - 1;
        state.frame = state.frame >= max ? 0 : state.frame + 1;
        els.timeline.value = state.frame;
        render();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* Test/debug surface: lets the render pipeline be driven headlessly and
   * from the console. Not used by the UI itself. */
  window.WM = {
    state,
    els,
    view,
    boot,
    buildEngine,
    runSimulation,
    render,
    loadCase,
    drawSounding,
    updateParamTable,
    updateMeters,
    updateWarnList,
    updateReportList,
    updateStormList,
    updateCamTable,
    updateFrameChip,
    showContextMenu,
    fitView,
    setProduct(id) {
      state.product = id;
    },
    CASES,
    PRODUCTS,
    MODELS,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
