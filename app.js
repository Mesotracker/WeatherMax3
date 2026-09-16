/* ============================================================================
 * WeatherMax 3 :: app.js
 * The desk is a game. The atmosphere runs on the wx/ physics stack; the player
 * watches it, draws warning polygons, picks AWIPS products and impact tags, and
 * is scored on polygon skill, lead time and hazard match against what the model
 * actually produced. Miss a significant event and it costs you.
 * ========================================================================== */
(function () {
  'use strict';

  const WX = window.WX;
  const { clamp, lerp } = WX;
  const TAU = Math.PI * 2;
  const STEP_MINUTES = 5;
  const MAX_TIME_INDEX = 72; // 6-hour shift
  const REALTIME_START_MS = 20000;
  const REALTIME_MIN_MS = 5500;
  const MISS_SEVERITY = 0.66;
  const MAX_RASTER_CACHE = 10;

  /* ───────────────────────────────────────────────────────── scenarios */
  const CASES = [
    {
      id: 'ok-supercell', name: 'Central OK · Tornado Outbreak', site: 'KTLX',
      brief: 'Dryline bulge into central Oklahoma. Extreme instability, strong streamwise shear, low LCLs. Discrete supercells, long-track tornadoes. Start with a PDS tornado watch, then work the cells.',
      s: { temperature: 88, dewpoint: 70, shear: 55, cape: 3500, helicity: 350, dcape: 1500 },
      bubbles: [{ fx: 0.34, fy: 0.5, r: 14, dT: 2.5, dQv: 1.4e-3 }, { fx: 0.62, fy: 0.34, r: 11, dT: 1.8, dQv: 1.0e-3 }],
    },
    {
      id: 'ks-qlcs', name: 'W. Kansas · QLCS / Bow', site: 'KDDC',
      brief: 'Strong low-level jet sharpening a baroclinic zone. A line develops a bow segment with embedded mesovortices — the wind threat outruns the tornado threat here.',
      s: { temperature: 82, dewpoint: 68, shear: 70, cape: 2400, helicity: 420, dcape: 900 },
      bubbles: [{ fx: 0.22, fy: 0.28, r: 13, dT: 2.6, dQv: 1.3e-3 }, { fx: 0.22, fy: 0.5, r: 13, dT: 2.6, dQv: 1.3e-3 }, { fx: 0.22, fy: 0.72, r: 13, dT: 2.6, dQv: 1.3e-3 }],
    },
    {
      id: 'tx-microburst', name: 'N. Texas · Dry Microburst', site: 'KFWS',
      brief: 'High-based storms over a deep dry sub-cloud layer. Large DCAPE, little low-level moisture. Downbursts, not tornadoes — watch the velocity product, not the hook.',
      s: { temperature: 99, dewpoint: 54, shear: 28, cape: 3800, helicity: 60, dcape: 2300 },
      bubbles: [{ fx: 0.45, fy: 0.55, r: 16, dT: 3.0, dQv: 1.6e-3 }],
    },
    {
      id: 'ms-hail', name: 'Mississippi · Giant Hail', site: 'KDGX',
      brief: 'Elevated mixed layer over a moist boundary layer. Very tall updrafts with hail suspended well above the freezing level. ρhv is your best friend.',
      s: { temperature: 84, dewpoint: 71, shear: 60, cape: 4400, helicity: 260, dcape: 1100 },
      bubbles: [{ fx: 0.4, fy: 0.45, r: 15, dT: 2.8, dQv: 1.8e-3 }],
    },
    {
      id: 'co-lp', name: 'CO Front Range · LP Supercell', site: 'KGLD',
      brief: 'High-elevation, low-precipitation supercell. Enormous hail aloft on a shallow moist layer, but LCLs are too high for tornadoes — do not over-tag.',
      s: { temperature: 86, dewpoint: 48, shear: 50, cape: 2600, helicity: 200, dcape: 1200 },
      bubbles: [{ fx: 0.3, fy: 0.5, r: 14, dT: 2.6, dQv: 0.9e-3 }],
    },
    {
      id: 'ne-marginal', name: 'Nebraska · Marginal Pulse', site: 'KUEX',
      brief: 'Capped environment, modest shear. Pulse storms and brief heavy rain. Over-warning this one will wreck your false-alarm count.',
      s: { temperature: 76, dewpoint: 62, shear: 26, cape: 1300, helicity: 90, dcape: 700 },
      bubbles: [{ fx: 0.5, fy: 0.5, r: 11, dT: 1.2, dQv: 0.7e-3 }],
    },
    {
      id: 'fl-squall', name: 'Florida · Sea-Breeze Squall', site: 'KTBW',
      brief: 'Moist, weakly sheared peninsula convection. Training cells and flash flooding, almost no hail or rotation.',
      s: { temperature: 91, dewpoint: 76, shear: 20, cape: 2900, helicity: 70, dcape: 500 },
      bubbles: [{ fx: 0.42, fy: 0.6, r: 12, dT: 1.3, dQv: 1.6e-3 }, { fx: 0.55, fy: 0.4, r: 10, dT: 1.1, dQv: 1.4e-3 }],
    },
  ];

  /* ───────────────────────────────────────────────────── AWIPS products */
  const PRODUCTS = [
    { id: 'outlook', label: 'Day 1 Convective Outlook', short: 'OUTLOOK', group: 'outlook', hazards: ['tornado', 'wind', 'hail'], duration: MAX_TIME_INDEX, color: '#f4b740', severe: false },
    { id: 'mesoscale-discussion', label: 'Mesoscale Discussion', short: 'MD', group: 'discussion', hazards: ['tornado', 'wind', 'hail', 'flood'], duration: 18, color: '#9db2c7', severe: false },
    { id: 'tornado-watch', label: 'Tornado Watch', short: 'TOR WATCH', group: 'watch', hazards: ['tornado'], duration: 24, color: '#e25da4', severe: false },
    { id: 'pds-tornado-watch', label: 'PDS Tornado Watch', short: 'PDS TOR WATCH', group: 'watch', hazards: ['tornado'], duration: 24, color: '#e33548', severe: true },
    { id: 'severe-watch', label: 'Severe Thunderstorm Watch', short: 'SVR WATCH', group: 'watch', hazards: ['wind', 'hail'], duration: 24, color: '#46c6d7', severe: false },
    { id: 'pds-severe-watch', label: 'PDS Severe Thunderstorm Watch', short: 'PDS SVR WATCH', group: 'watch', hazards: ['wind', 'hail'], duration: 24, color: '#f36b35', severe: true },
    { id: 'tornado-warning', label: 'Tornado Warning', short: 'TOR', group: 'warning', hazards: ['tornado'], duration: 4, color: '#e33548', severe: false },
    { id: 'pds-tornado-warning', label: 'PDS Tornado Warning', short: 'PDS TOR', group: 'warning', hazards: ['tornado'], duration: 4, color: '#b982ff', severe: true },
    { id: 'severe-warning', label: 'Severe Thunderstorm Warning', short: 'SVR', group: 'warning', hazards: ['wind', 'hail'], duration: 4, color: '#f4b740', severe: false },
    { id: 'destructive-severe-warning', label: 'Destructive Severe Warning', short: 'DESTRUCTIVE', group: 'warning', hazards: ['wind', 'hail'], duration: 4, color: '#f36b35', severe: true },
    { id: 'flash-flood-warning', label: 'Flash Flood Warning', short: 'FFW', group: 'warning', hazards: ['flood'], duration: 8, color: '#53c46f', severe: false },
    { id: 'special-weather', label: 'Special Weather Statement', short: 'SPS', group: 'advisory', hazards: ['wind', 'hail'], duration: 3, color: '#a7aa9b', severe: false },
  ];

  const MODELS = [
    { id: 'hrrr', name: 'HRRR 3-km', meta: '3 km', bias: { shiftKm: 6, timingMin: -10, zScale: 1.06, dbzOffset: 2.0, uhScale: 1.25, windScale: 1.1, hailScale: 1.15, qpfScale: 0.9 } },
    { id: 'nam-nest', name: 'NAM 3-km Nest', meta: '3 km', bias: { shiftKm: -14, timingMin: 20, zScale: 0.94, dbzOffset: -2.0, uhScale: 0.8, windScale: 0.92, hailScale: 0.75, qpfScale: 1.25 } },
    { id: 'nam-fire', name: 'NAM-FIRE 1.3-km', meta: '1.3 km', bias: { shiftKm: 4, timingMin: -25, zScale: 1.12, dbzOffset: 3.0, uhScale: 1.45, windScale: 1.18, hailScale: 1.3, qpfScale: 1.05 } },
    { id: 'rap', name: 'RAP 13-km', meta: '13 km', bias: { shiftKm: -22, timingMin: 35, zScale: 0.82, dbzOffset: -4.0, uhScale: 0.55, windScale: 0.85, hailScale: 0.55, qpfScale: 1.15 } },
  ];
  const MODEL_FIELDS = [
    { id: 'compz', name: 'Composite Refl' },
    { id: 'uh', name: 'Max UH' },
    { id: 'wind10', name: 'Max 10-m Wind' },
    { id: 'hail', name: 'Max Hail' },
    { id: 'qpf', name: 'QPF' },
  ];

  const LAYERS = [
    { id: 'radar', name: 'Reflectivity', label: 'Base Reflectivity' },
    { id: 'composite', name: 'Composite', label: 'Composite Reflectivity (MRMS)' },
    { id: 'velocity', name: 'Velocity', label: 'Storm Relative Velocity' },
    { id: 'cc', name: 'ρhv', label: 'Correlation Coefficient' },
    { id: 'ptype', name: 'Precip Type', label: 'Hydrometeor / Precipitation Type' },
    { id: 'rotation', name: 'MRMS Rotation', label: 'MRMS Rotation (coarse composite)' },
    { id: 'qpf', name: 'Precip', label: 'Model Precipitation Accumulation' },
    { id: 'satellite', name: 'Satellite', label: 'Simulated IR Brightness Temperature' },
    { id: 'model', name: 'Model', label: 'CAM Guidance' },
    { id: 'reports', name: 'Storm Reports', label: 'Local Storm Reports (delayed)' },
  ];

  const REPORT_COLORS = {
    tornado: '#e33548', tornado_sig: '#b982ff', hail: '#53c46f', hail_sig: '#2f9c56',
    wind_damage: '#46c6d7', wind_gust: '#7fd8e6', wind_gust_sig: '#2f8fa0',
  };

  /* ─────────────────────────────────────────────────────────── state */
  const els = {};
  const state = {
    engine: null,
    caseId: CASES[0].id,
    siteId: 'KTLX',
    seed: 7,
    currentIndex: 0,
    viewIndex: 0,
    followCurrent: true,
    playing: false,
    layer: 'radar',
    tilt: 0,
    modelId: 'hrrr',
    modelField: 'compz',
    selectedProduct: 'severe-warning',
    areaMode: 'county',
    selection: null,
    drawing: null,
    products: [],
    serial: 1,
    missed: new Set(),
    stats: { issued: 0, hits: 0, falseAlarms: 0, misses: 0, skillPoints: 0, polygonSkill: 0, leadSkill: 0, hazardSkill: 0 },
    customPalettes: { radar: null, velocity: null },
    zoom: 1,
    simRunning: false,
    stepTimer: null,
    playTimer: null,
  };

  /* ───────────────────────────────────────────────────────── map view */
  // The map view is in model kilometres so a radar-site swap never moves the
  // storms — only the antenna changes.
  const view = { x0: 0, y0: 0, x1: 325, y1: 245 };
  const baseView = { x0: 0, y0: 0, x1: 325, y1: 245 };
  let ctx = null;
  let dpr = 1;
  let canvasW = 900;
  let canvasH = 620;

  function fitCanvas() {
    const shell = els.mapShell.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.floor(shell.width));
    const h = Math.max(240, Math.floor(shell.height));
    // cap the backing store so the forward operator stays cheap
    const scale = Math.min(1, Math.sqrt(380000 / (w * h * dpr * dpr)));
    canvasW = Math.floor(w * dpr * scale);
    canvasH = Math.floor(h * dpr * scale);
    els.weatherCanvas.width = canvasW;
    els.weatherCanvas.height = canvasH;
    ctx = els.weatherCanvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;
  }

  function resetView() {
    const e = state.engine;
    if (!e) return;
    baseView.x0 = 0;
    baseView.y0 = 0;
    baseView.x1 = e.domainKm.w;
    baseView.y1 = e.domainKm.h;
    state.zoom = 1;
    applyZoom();
  }
  function applyZoom() {
    const cx = (baseView.x0 + baseView.x1) / 2;
    const cy = (baseView.y0 + baseView.y1) / 2;
    const hw = ((baseView.x1 - baseView.x0) / 2) / state.zoom;
    const hh = ((baseView.y1 - baseView.y0) / 2) / state.zoom;
    view.x0 = cx - hw;
    view.x1 = cx + hw;
    // keep the aspect ratio of the canvas
    const aspect = canvasH / Math.max(1, canvasW);
    const wantH = (view.x1 - view.x0) * aspect;
    view.y0 = cy - wantH / 2;
    view.y1 = cy + wantH / 2;
    rasterCache.clear();
  }

  const kmToPx = (x, y) => ({
    x: ((x - view.x0) / (view.x1 - view.x0)) * canvasW,
    y: ((y - view.y1) / (view.y0 - view.y1)) * canvasH,
  });
  const pxToKm = (px, py) => ({
    x: view.x0 + (px / canvasW) * (view.x1 - view.x0),
    y: view.y1 + (py / canvasH) * (view.y0 - view.y1),
  });

  /* ─────────────────────────────────────────────────── engine lifecycle */
  function buildEngine() {
    const c = getCase();
    const site = WX.siteById(state.siteId) || WX.RADAR_SITES[0];
    const input = readSoundingInputs();
    const nx = 57;
    const ny = 43;
    const dxKm = 5;
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
      nx, ny, dxKm, nz: 14,
      origin: site,
      maxRangeKm: 170,
      azimuths: 240,
    });
    state.engine.init();
    state.currentIndex = 0;
    state.viewIndex = 0;
    resetView();
    updateBriefing();
    updateParamTable();
    drawSounding();
  }

  function readSoundingInputs() {
    const num = (el, fb, lo, hi) => clamp(Number(el.value) || fb, lo, hi);
    return {
      temperature: num(els.tempInput, 88, -20, 115),
      dewpoint: num(els.dewpointInput, 70, -40, 90),
      shear: num(els.shearInput, 55, 0, 120),
      cape: num(els.capeInput, 3500, 0, 7000),
      helicity: num(els.helicityInput, 350, 0, 900),
      dcape: num(els.dcapeInput, 1500, 0, 3000),
    };
  }

  function getCase() {
    return CASES.find((c) => c.id === state.caseId) || CASES[0];
  }

  /** Tempo accelerates across the shift — the desk loses time to think. */
  function tempoMs() {
    const ramp = clamp(state.currentIndex / MAX_TIME_INDEX, 0, 1);
    return Math.round(lerp(REALTIME_START_MS, REALTIME_MIN_MS, ramp * ramp));
  }
  function tempoLabel() {
    return `${(REALTIME_START_MS / tempoMs()).toFixed(1)}×`;
  }

  function startShift() {
    stopPlay();
    state.products.length = 0;
    state.missed.clear();
    state.serial = 1;
    state.stats = { issued: 0, hits: 0, falseAlarms: 0, misses: 0, skillPoints: 0, polygonSkill: 0, leadSkill: 0, hazardSkill: 0 };
    rasterCache.clear();
    buildEngine();
    state.simRunning = true;
    setChip(els.simChip, 'RUNNING', 'run');
    renderAll();
    runStepLoop();
    startPlay();
  }

  /** Integrate the model one 5-minute frame ahead, in the background. */
  function runStepLoop() {
    if (state.stepTimer) clearTimeout(state.stepTimer);
    const tick = () => {
      const e = state.engine;
      if (!e || !state.simRunning) return;
      if (state.currentIndex >= MAX_TIME_INDEX) {
        state.simRunning = false;
        stopPlay();
        setChip(els.simChip, 'SHIFT OVER', 'warn');
        toast('Shift complete', '');
        renderAll();
        return;
      }
      // let the model catch up with the clock, but never block the UI long
      if (e.frames.length <= state.currentIndex) {
        e.escalate(state.currentIndex * STEP_MINUTES);
        e.step();
        checkMisses(state.currentIndex);
      }
      state.stepTimer = setTimeout(tick, 0);
    };
    tick();
  }

  function startPlay() {
    if (state.playTimer) clearInterval(state.playTimer);
    state.playing = true;
    els.playBtn.textContent = 'Pause';
    els.playBtn.classList.add('on');
    const schedule = () => {
      if (state.playTimer) clearTimeout(state.playTimer);
      state.playTimer = setTimeout(() => {
        if (!state.playing) return;
        advance(1);
        schedule();
      }, tempoMs());
    };
    schedule();
  }
  function stopPlay() {
    state.playing = false;
    if (state.playTimer) clearTimeout(state.playTimer);
    state.playTimer = null;
    els.playBtn.textContent = 'Play';
    els.playBtn.classList.remove('on');
  }

  /** Advance the clock by `steps` five-minute intervals. */
  function advance(steps) {
    const e = state.engine;
    if (!e) return;
    // the model must exist out to the requested time
    let guard = 0;
    while (e.frames.length <= state.currentIndex + steps && e.frames.length <= MAX_TIME_INDEX + 1 && guard < 4) {
      e.escalate(state.currentIndex * STEP_MINUTES);
      e.step();
      guard += 1;
    }
    state.currentIndex = clamp(state.currentIndex + steps, 0, Math.min(MAX_TIME_INDEX, e.frames.length - 1));
    checkMisses(state.currentIndex);
    if (state.followCurrent) state.viewIndex = state.currentIndex;
    else state.viewIndex = Math.min(state.viewIndex, state.currentIndex);
    if (state.currentIndex >= MAX_TIME_INDEX) {
      state.simRunning = false;
      stopPlay();
      setChip(els.simChip, 'SHIFT OVER', 'warn');
    }
    renderAll();
  }

  function setFrame(idx) {
    const e = state.engine;
    if (!e) return;
    state.viewIndex = clamp(idx, 0, Math.min(state.currentIndex, e.frames.length - 1));
    state.followCurrent = state.viewIndex === state.currentIndex;
    renderAll();
  }

  /* ─────────────────────────────────────────────── areas / polygons */
  function selectionFromDrag(start, current, mode) {
    const rect = normalizeRect(start.x, start.y, current.x, current.y);
    if (mode === 'cone') {
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const dist = Math.max(2, Math.hypot(dx, dy));
      const nx = -dy / dist;
      const ny = dx / dist;
      const sw = clamp(dist * 0.16, 1.5, 6);
      const ew = clamp(dist * 0.4, 4, 22);
      return areaFromPoints('cone', [
        { x: start.x + nx * sw, y: start.y + ny * sw },
        { x: current.x + nx * ew, y: current.y + ny * ew },
        { x: current.x - nx * ew, y: current.y - ny * ew },
        { x: start.x - nx * sw, y: start.y - ny * sw },
      ]);
    }
    if (mode === 'county') {
      const seed = state.seed + Math.round((rect.x1 + rect.y1 + rect.x2 + rect.y2) * 37);
      const notch = (salt, scale) => (WX.hash(seed, salt, 1, 7) - 0.5) * 2 * scale;
      const w = rect.x2 - rect.x1;
      const h = rect.y2 - rect.y1;
      return areaFromPoints('county', [
        { x: rect.x1 + notch(1, w * 0.05), y: rect.y1 + notch(2, h * 0.05) },
        { x: rect.x1 + w * 0.44, y: rect.y1 + notch(3, h * 0.07) },
        { x: rect.x2 + notch(4, w * 0.04), y: rect.y1 + h * 0.3 },
        { x: rect.x2 + notch(5, w * 0.05), y: rect.y2 - h * 0.24 },
        { x: rect.x1 + w * 0.52, y: rect.y2 + notch(6, h * 0.06) },
        { x: rect.x1 + notch(7, w * 0.05), y: rect.y2 - h * 0.16 },
      ]);
    }
    if (mode === 'polygon') {
      // octagon the user can refine by dragging further
      const cx = (rect.x1 + rect.x2) / 2;
      const cy = (rect.y1 + rect.y2) / 2;
      const rx = (rect.x2 - rect.x1) / 2;
      const ry = (rect.y2 - rect.y1) / 2;
      const pts = [];
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU - Math.PI / 8;
        pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
      }
      return areaFromPoints('polygon', pts);
    }
    return areaFromPoints('rect', [
      { x: rect.x1, y: rect.y1 },
      { x: rect.x2, y: rect.y1 },
      { x: rect.x2, y: rect.y2 },
      { x: rect.x1, y: rect.y2 },
    ]);
  }

  function areaFromPoints(mode, points) {
    return { mode, points };
  }
  function normalizeRect(x1, y1, x2, y2) {
    return { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
  }
  function areaBounds(area) {
    const xs = area.points.map((p) => p.x);
    const ys = area.points.map((p) => p.y);
    return normalizeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  }
  function areaSize(area) {
    let sum = 0;
    for (let i = 0; i < area.points.length; i += 1) {
      const a = area.points[i];
      const b = area.points[(i + 1) % area.points.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) * 0.5;
  }
  function pointInArea(x, y, area) {
    let inside = false;
    const pts = area.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
      const pi = pts[i];
      const pj = pts[j];
      if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y || 1e-9) + pi.x) inside = !inside;
    }
    return inside;
  }
  /** Fraction of a hazard ellipse covered by the polygon, penalised for
   *  polygons much larger than the hazard. */
  function areaHazardOverlap(area, hazard) {
    let inside = 0;
    let covered = 0;
    const n = 7;
    const w = hazard.w;
    const h = hazard.h;
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const x = hazard.x - w + (ix / (n - 1)) * w * 2;
        const y = hazard.y - h + (iy / (n - 1)) * h * 2;
        const rx = (x - hazard.x) / w;
        const ry = (y - hazard.y) / h;
        if (rx * rx + ry * ry > 1) continue;
        inside += 1;
        if (pointInArea(x, y, area)) covered += 1;
      }
    }
    if (!inside) return 0;
    const containment = covered / inside;
    const hazardArea = Math.PI * w * h;
    const sizePenalty = clamp(hazardArea / Math.max(areaSize(area), hazardArea), 0.34, 1);
    return containment * sizePenalty;
  }

  /* ───────────────────────────────────────────── truth hazard access */
  function truthHazards(timeIndex, kinds) {
    const e = state.engine;
    if (!e) return [];
    const frame = e.frames[clamp(timeIndex, 0, e.frames.length - 1)];
    if (!frame) return [];
    return frame.hazards
      .filter((h) => !kinds || kinds.includes(h.kind))
      .map((h) => ({
        id: h.id,
        kind: h.kind,
        x: h.x / 1000,
        y: h.y / 1000,
        w: (h.radius || 6000) / 1000,
        h: (h.radius || 6000) / 1000 * (h.kind === 'wind' ? 0.62 : 0.8),
        severity: h.severity,
        tag: h.tag,
        mph: h.mph,
        inches: h.inches,
        ef: h.ef,
      }));
  }

  /* ───────────────────────────────────────────────── verification */
  function verifyProduct(product, area, start, duration, options) {
    const end = Math.min(MAX_TIME_INDEX, start + duration);
    let best = null;
    let expected = 0;
    for (let t = start; t <= end; t += 1) {
      const hazards = truthHazards(t, product.hazards);
      expected += hazards.length;
      for (const hazard of hazards) {
        const overlap = areaHazardOverlap(area, hazard);
        const centerCovered = pointInArea(hazard.x, hazard.y, area) ? 1 : 0;
        const spatial = Math.max(overlap, centerCovered * 0.72);
        if (spatial <= 0.04) continue;
        const leadSteps = Math.max(0, t - start);
        const leadScore =
          product.group === 'warning'
            ? clamp(100 - Math.abs(leadSteps - 2) * 16, 35, 100)
            : product.group === 'watch'
            ? clamp(58 + leadSteps * 2.4, 40, 100)
            : clamp(66 + leadSteps * 1.2, 45, 100);
        const severityFit = severityFitness(product, hazard, options);
        const hazardFit = hazardFitness(product, hazard, options);
        const raw = spatial * 0.46 + (leadScore / 100) * 0.24 + severityFit * 0.18 + hazardFit * 0.12;
        const score = Math.round(raw * 100);
        if (!best || score > best.score) best = { hazard, t, score, spatial, leadScore, severityFit, hazardFit };
      }
    }
    if (!best) {
      const penalty = product.group === 'warning' ? -38 : product.group === 'watch' ? -26 : -18;
      return {
        hit: false,
        score: penalty,
        polygon: 0,
        lead: 0,
        hazard: expected ? 20 : 0,
        summary: expected ? 'Area missed the hazard corridor' : 'No matching hazard in the valid window',
      };
    }
    const overTag = product.severe && best.hazard.severity < 0.74 ? 14 : 0;
    const tiny = areaSize(area) < 25 ? 8 : 0;
    const score = Math.round(best.score - overTag - tiny);
    return {
      hit: score >= 44,
      score: Math.max(8, score - 45),
      polygon: Math.round(best.spatial * 100),
      lead: Math.round(best.leadScore),
      hazard: Math.round(best.hazardFit * 100),
      summary: `${best.hazard.kind.toUpperCase()} match at ${formatTime(best.t)} · severity ${Math.round(best.hazard.severity * 100)}%`,
      matchedAt: best.t,
      severity: best.hazard.severity,
    };
  }

  function severityFitness(product, hazard, options) {
    if (product.group === 'watch') {
      const target = clamp(watchProbability(hazard.kind, options) / 100 + (options.watchTag === 'pds' ? 0.08 : 0), 0.28, 0.98);
      let score = 1 - Math.min(0.5, Math.abs(target - hazard.severity));
      if (options.watchTag === 'pds' && hazard.severity < 0.82) score -= 0.18;
      return clamp(score, 0.18, 1);
    }
    if (product.group === 'warning' || product.group === 'advisory') {
      const target = severityTarget(hazard.kind, options);
      let score = 1 - Math.min(0.58, Math.abs(target - hazard.severity));
      if (options.warningBasis === 'observed' && hazard.severity < 0.56) score -= 0.12;
      if (options.warningBasis === 'spotter' && hazard.severity < 0.66) score -= 0.16;
      if (options.warningBasis === 'emergency' && hazard.severity < 0.9) score -= 0.28;
      return clamp(score, 0.18, 1);
    }
    return clamp(1 - Math.min(0.5, Math.abs(0.6 - hazard.severity)), 0.2, 1);
  }

  /** Map the impact tag + max wind/hail selects onto a severity target. */
  function severityTarget(kind, options) {
    const tag = { base: 0.42, considerable: 0.66, destructive: 0.84, catastrophic: 0.95 }[options.impactTag || 'base'] ?? 0.42;
    if (kind === 'wind') {
      const mph = Number(options.windThreat || 70);
      return clamp(0.25 + ((mph - 58) / 45) * 0.75, 0.2, 1);
    }
    if (kind === 'hail') {
      const inches = Number(options.hailThreat || 1.75);
      return clamp(0.2 + ((inches - 0.75) / 3.25) * 0.8, 0.2, 1);
    }
    if (kind === 'tornado') {
      const map = { spinup: 0.35, tight: 0.55, strong: 0.75, violent: 0.92 };
      return map[options.torThreat || 'tight'] ?? 0.55;
    }
    if (kind === 'flood') {
      const rate = Number(options.rainRate || 2);
      return clamp(rate / 5, 0.3, 1);
    }
    return tag;
  }

  function hazardFitness(product, hazard, options) {
    // does the product actually cover this hazard type at the tagged level?
    if (!product.hazards.includes(hazard.kind)) return 0.2;
    if (product.group !== 'warning' && product.group !== 'advisory') return 0.8;
    if (hazard.kind === 'wind') {
      const want = Number(options.windThreat || 70);
      const got = hazard.mph || 58;
      return clamp(1 - Math.abs(want - got) / 30, 0.2, 1);
    }
    if (hazard.kind === 'hail') {
      const want = Number(options.hailThreat || 1.75);
      const got = hazard.inches || 0.75;
      return clamp(1 - Math.abs(want - got) / 2, 0.2, 1);
    }
    if (hazard.kind === 'tornado') {
      const want = { spinup: 0, tight: 1, strong: 2, violent: 4 }[options.torThreat || 'tight'] ?? 1;
      const got = hazard.ef || 0;
      return clamp(1 - Math.abs(want - got) / 3, 0.2, 1);
    }
    return 0.7;
  }

  function watchProbability(kind, options) {
    if (kind === 'tornado') return Number(options.watchTorProb || 15);
    if (kind === 'wind') return Number(options.watchWindProb || 30);
    if (kind === 'hail') return Number(options.watchHailProb || 30);
    return 15;
  }

  function issueProduct() {
    if (!state.selection) {
      toast('Draw a warning area first', 'fa');
      return;
    }
    const product = getProduct();
    const options = getProductOptionValues();
    const duration = getDurationSteps(product, options);
    const issuedAt = state.currentIndex;
    const verification = verifyProduct(product, state.selection, issuedAt, duration, options);
    const issued = {
      number: state.serial++,
      productId: product.id,
      start: issuedAt,
      end: Math.min(MAX_TIME_INDEX, issuedAt + duration),
      area: JSON.parse(JSON.stringify(state.selection)),
      options,
      verification,
      text: product.group === 'warning' ? warnGenText(product, issuedAt, duration, options, verification) : '',
    };
    state.products.push(issued);
    state.stats.issued += 1;
    state.stats.skillPoints += verification.score;
    if (verification.hit) state.stats.hits += 1;
    else state.stats.falseAlarms += 1;
    state.stats.polygonSkill = rolling(state.stats.polygonSkill, verification.polygon, state.stats.issued);
    state.stats.leadSkill = rolling(state.stats.leadSkill, verification.lead, state.stats.issued);
    state.stats.hazardSkill = rolling(state.stats.hazardSkill, verification.hazard, state.stats.issued);
    state.selection = null;
    toast(verification.hit ? `HIT +${verification.score}` : `FALSE ALARM ${verification.score}`, verification.hit ? 'hit' : 'fa');
    renderAll();
  }

  function checkMisses(timeIndex) {
    const hazards = truthHazards(timeIndex).filter((h) => h.severity >= MISS_SEVERITY);
    for (const hazard of hazards) {
      if (hazard.kind === 'flood' && hazard.severity < 0.78) continue;
      const key = `${hazard.id}-${Math.floor(timeIndex / 6)}`;
      if (state.missed.has(key)) continue;
      const covered = state.products.some((p) => {
        const cat = getProduct(p.productId);
        if (cat.group !== 'warning') return false;
        if (p.start > timeIndex || p.end < timeIndex) return false;
        if (!cat.hazards.includes(hazard.kind)) return false;
        return pointInArea(hazard.x, hazard.y, p.area) || areaHazardOverlap(p.area, hazard) > 0.16;
      });
      if (!covered) {
        state.missed.add(key);
        state.stats.misses += 1;
        state.stats.skillPoints -= 32;
        toast(`MISSED ${hazard.kind.toUpperCase()} −32`, 'miss');
      }
    }
  }

  function rolling(current, next, count) {
    return Math.round((current * Math.max(0, count - 1) + next) / Math.max(1, count));
  }
  function deskScore() {
    const attempts = Math.max(1, state.stats.issued + state.stats.misses);
    return clamp(Math.round(72 + state.stats.skillPoints / attempts), 0, 100);
  }

  function warnGenText(product, start, duration, options, v) {
    const e = state.engine;
    const site = e ? e.site : { city: '—', state: '—' };
    const end = Math.min(MAX_TIME_INDEX, start + duration);
    const tagLine =
      product.hazards.includes('tornado')
        ? `...${(options.impactTag || 'base').toUpperCase()} TORNADO WARNING...`
        : `...${(options.impactTag || 'base').toUpperCase()} SEVERE THUNDERSTORM WARNING...`;
    const basis = { radar: 'RADAR INDICATED', observed: 'OBSERVED', spotter: 'SPOTTER CONFIRMED', emergency: 'TORNADO EMERGENCY' }[options.warningBasis || 'radar'];
    const wind = options.windThreat ? `MAX WIND ${options.windThreat} MPH. ` : '';
    const hail = options.hailThreat ? `MAX HAIL ${options.hailThreat} INCHES. ` : '';
    const tor = options.torThreat ? `THREAT: ${options.torThreat.toUpperCase()}. ` : '';
    return [
      `${e ? e.site.id : 'XXXX'} SVR${product.short.replace(/[^A-Z]/g, '')}`,
      tagLine,
      '',
      `THE NATIONAL WEATHER SERVICE IN ${site.city.toUpperCase()} ${site.state} HAS ISSUED A`,
      ``,
      `* ${product.label.toUpperCase()} FOR...`,
      `  A USER-DRAWN POLYGON`,
      ``,
      `* UNTIL ${formatTime(end)}  (${duration * STEP_MINUTES} MINUTES)`,
      ``,
      `* ${basis}. ${tor}${wind}${hail}`,
      ``,
      `LAT...LON  ${state.selection ? polygonString(state.selection) : ''}`,
      `TIME...MOT...LOC ${formatTime(start)} ${stormMotionString()}`,
      ``,
      v.summary,
    ].join('\n');
  }
  function polygonString(area) {
    return area.points.slice(0, 6).map((p) => `${p.y.toFixed(2)} ${p.x.toFixed(2)}`).join('  ');
  }
  function stormMotionString() {
    const m = state.engine ? state.engine.sounding.metrics.motion : { met: 240, speed: 15 };
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const to = dirs[Math.round((((m.met + 180) % 360) / 45)) % 8];
    return `${Math.round(m.speed * 1.94384)}KT ${to}`;
  }

  /* ────────────────────────────────────────────────── product options */
  function getProduct(id = state.selectedProduct) {
    return PRODUCTS.find((p) => p.id === id) || PRODUCTS[6];
  }
  function getModel() {
    return MODELS.find((m) => m.id === state.modelId) || MODELS[0];
  }
  function getDurationSteps(product, options) {
    if (product.group === 'watch') return Math.round((Number(options.watchDuration || 6) * 60) / STEP_MINUTES);
    if (product.group === 'warning') return Math.round(Number(options.warningDuration || 60) / STEP_MINUTES);
    if (product.group === 'advisory') return Math.round(Number(options.statementDuration || 45) / STEP_MINUTES);
    return product.duration;
  }

  function renderProductOptions() {
    const product = getProduct();
    const existing = getProductOptionValues(true);
    els.productOptions.innerHTML = '';
    addSelect('areaShape', 'Area Shape', [
      ['county', 'County-style'], ['cone', 'Storm cone'], ['polygon', 'Free polygon'], ['rect', 'Box area'],
    ], existing.areaShape || state.areaMode);
    if (product.group === 'outlook') {
      addSelect('riskLevel', 'Risk', [['MRGL', 'Marginal'], ['SLGT', 'Slight'], ['ENH', 'Enhanced'], ['MDT', 'Moderate'], ['HIGH', 'High']], existing.riskLevel || 'ENH');
      addSelect('torProb', 'Tornado', [['2', '2%'], ['5', '5%'], ['10', '10%'], ['15', '15%'], ['30', '30%']], existing.torProb || '10');
      addSelect('windProb', 'Wind', [['15', '15%'], ['30', '30%'], ['45', '45%'], ['60', '60%']], existing.windProb || '30');
      addSelect('hailProb', 'Hail', [['15', '15%'], ['30', '30%'], ['45', '45%'], ['60', '60%']], existing.hailProb || '30');
    } else if (product.group === 'discussion') {
      addSelect('mdTorIntensity', 'TOR', [['brief', 'Brief spinups'], ['organized', 'Organized'], ['strong', 'Strong'], ['violent', 'Violent']], existing.mdTorIntensity || 'organized');
      addSelect('mdWindIntensity', 'Wind', [['marginal', 'Marginal'], ['severe', 'Severe'], ['significant', 'Significant'], ['destructive', 'Destructive']], existing.mdWindIntensity || 'significant');
      addSelect('mdHailIntensity', 'Hail', [['marginal', 'Marginal'], ['severe', 'Severe'], ['very-large', 'Very large'], ['giant', 'Giant']], existing.mdHailIntensity || 'severe');
    } else if (product.group === 'watch') {
      addSelect('watchTorProb', 'TOR Prob', [['5', '5%'], ['15', '15%'], ['30', '30%'], ['45', '45%'], ['60', '60%'], ['95', '95%']], existing.watchTorProb || '15');
      addSelect('watchWindProb', 'Wind Prob', [['15', '15%'], ['30', '30%'], ['45', '45%'], ['60', '60%'], ['95', '95%']], existing.watchWindProb || '30');
      addSelect('watchHailProb', 'Hail Prob', [['15', '15%'], ['30', '30%'], ['45', '45%'], ['60', '60%'], ['95', '95%']], existing.watchHailProb || '30');
      addSelect('watchTag', 'Tag', [['standard', 'Standard'], ['enhanced', 'Enhanced'], ['pds', 'PDS']], product.severe ? 'pds' : existing.watchTag || 'standard');
      addSelect('watchDuration', 'Duration', [['3', '3 hours'], ['4', '4 hours'], ['6', '6 hours'], ['8', '8 hours']], existing.watchDuration || '6');
    } else if (product.group === 'warning') {
      addSelect('warningBasis', 'Basis', [['radar', 'Radar indicated'], ['observed', 'Observed'], ['spotter', 'Spotter confirmed'], ['emergency', 'Emergency']], existing.warningBasis || 'radar');
      addSelect('impactTag', 'Impact', [['base', 'Base'], ['considerable', 'Considerable'], ['destructive', 'Destructive'], ['catastrophic', 'Catastrophic']], product.severe ? 'destructive' : existing.impactTag || 'base');
      addSelect('warningDuration', 'Duration', [['30', '30 min'], ['45', '45 min'], ['60', '60 min'], ['90', '90 min']], existing.warningDuration || '60');
      if (product.hazards.includes('tornado')) {
        addSelect('torThreat', 'TOR Threat', [['spinup', 'Short-lived spinup'], ['tight', 'Tight couplet'], ['strong', 'Strong tornado'], ['violent', 'Violent tornado']], existing.torThreat || 'tight');
        addSelect('torConfidence', 'Confidence', [['40', '40%'], ['60', '60%'], ['80', '80%'], ['95', '95%']], existing.torConfidence || '80');
      }
      if (product.hazards.includes('wind')) {
        addSelect('windThreat', 'Wind Max', [['60', '60 mph'], ['70', '70 mph'], ['80', '80 mph'], ['90', '90 mph']], existing.windThreat || (product.severe ? '80' : '70'));
      }
      if (product.hazards.includes('hail')) {
        addSelect('hailThreat', 'Hail Max', [['1.00', '1.00 in'], ['1.75', '1.75 in'], ['2.50', '2.50 in'], ['3.50', '3.50 in']], existing.hailThreat || (product.severe ? '2.50' : '1.75'));
      }
      if (product.hazards.includes('flood')) {
        addSelect('rainRate', 'Rain Rate', [['1.0', '1.0 in/hr'], ['2.0', '2.0 in/hr'], ['3.5', '3.5 in/hr'], ['5.0', '5.0 in/hr']], existing.rainRate || '2.0');
      }
    } else {
      addSelect('statementTone', 'Tone', [['standard', 'Standard'], ['strong', 'Strong storm']], existing.statementTone || 'standard');
      addSelect('statementDuration', 'Duration', [['30', '30 min'], ['45', '45 min'], ['60', '60 min']], existing.statementDuration || '45');
    }
  }
  function addSelect(id, label, entries, value) {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const sel = document.createElement('select');
    sel.id = id;
    for (const [v, text] of entries) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = text;
      if (v === value) opt.selected = true;
      sel.appendChild(opt);
    }
    wrap.appendChild(sel);
    els.productOptions.appendChild(wrap);
  }
  function getProductOptionValues(silent) {
    const out = {};
    els.productOptions.querySelectorAll('select').forEach((s) => { out[s.id] = s.value; });
    if (!silent && out.areaShape) state.areaMode = out.areaShape;
    return out;
  }

  /* ────────────────────────────────────────────────── .pal palettes */
  function parsePal(text) {
    const entries = [];
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;
      const parts = line.split(/[\s,;]+/).map(Number);
      if (parts.length >= 4 && parts.slice(0, 4).every((n) => isFinite(n))) {
        entries.push({ value: parts[0], color: [parts[1], parts[2], parts[3]] });
      }
    }
    entries.sort((a, b) => a.value - b.value);
    return entries.length ? { entries, name: `${entries.length} levels` } : null;
  }
  function customColor(layer, value) {
    const pal = state.customPalettes[layer];
    if (!pal) return null;
    const e = pal.entries;
    if (value <= e[0].value) return e[0].color;
    for (let i = 1; i < e.length; i += 1) {
      if (value <= e[i].value) {
        const t = (value - e[i - 1].value) / (e[i].value - e[i - 1].value || 1);
        const a = e[i - 1].color;
        const b = e[i].color;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      }
    }
    return e[e.length - 1].color;
  }
  /** If a custom palette is loaded for this layer, rebuild a 256-entry LUT. */
  function lutFor(layer, moment) {
    if (layer !== 'radar' && layer !== 'velocity') return null;
    const pal = state.customPalettes[layer];
    if (!pal) return null;
    const span = layer === 'radar' ? [-30, 95] : [-64, 64];
    const lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i += 1) {
      const v = span[0] + ((span[1] - span[0]) * i) / 255;
      const c = customColor(layer, v);
      lut[i * 4] = c[0];
      lut[i * 4 + 1] = c[1];
      lut[i * 4 + 2] = c[2];
      lut[i * 4 + 3] = layer === 'radar' ? clamp(150 + (v - 5) * 5, 150, 250) : 225;
    }
    return { lut, lo: span[0], hi: span[1], scale: 255 / (span[1] - span[0]) };
  }

  /* ──────────────────────────────────────────────────────── rendering */
  const rasterCache = new Map();
  function cachePut(key, value) {
    if (rasterCache.size >= MAX_RASTER_CACHE) rasterCache.delete(rasterCache.keys().next().value);
    rasterCache.set(key, value);
  }

  let imgBuf = null;
  function renderMap() {
    const e = state.engine;
    if (!e || !ctx) return;
    const frame = e.frames[clamp(state.viewIndex, 0, e.frames.length - 1)];
    if (!frame) return;
    const layer = LAYERS.find((l) => l.id === state.layer) || LAYERS[0];
    ctx.fillStyle = '#05090d';
    ctx.fillRect(0, 0, canvasW, canvasH);

    if (layer.id === 'reports') paintReflectivityBackdrop(frame, 0.42);
    else if (layer.id === 'qpf') paintQpf(frame);
    else if (layer.id === 'satellite') paintSatellite(frame);
    else if (layer.id === 'model') paintModel(frame);
    else if (layer.id === 'rotation') paintRotation(frame);
    else paintRadarLayer(frame, layer);

    drawGeography();
    drawStormCells(frame);
    drawTornadoTracks(frame);
    drawReports(frame);
    drawIssuedProducts(frame);
    drawSelection();
    drawLegend(layer);
  }

  function viewArg() {
    return { x0: view.x0, y0: view.y0, x1: view.x1, y1: view.y1, width: canvasW, height: canvasH };
  }

  function paintRadarLayer(frame, layer) {
    const e = state.engine;
    const moment = { radar: 'z', composite: 'z', velocity: 'v', cc: 'cc', ptype: 'ptype' }[layer.id];
    if (!moment) return;
    const key = `${frame.index}|${layer.id}|${state.tilt}|${state.zoom.toFixed(2)}|${view.x0.toFixed(1)}|${state.customPalettes[layer.id] ? 'p' : 'd'}`;
    let out = rasterCache.get(key);
    if (!out) {
      const radar = e.radar;
      radar.markFrame(frame.index);
      const tilts = layer.id === 'composite' ? [0, 3, 6] : [state.tilt];
      out = radar.raster(moment, tilts, viewArg(), frame.index, lutFor(layer.id, moment));
      cachePut(key, out);
    }
    blit(out);
  }

  function blit(out) {
    if (!imgBuf || imgBuf.width !== out.width || imgBuf.height !== out.height) imgBuf = ctx.createImageData(out.width, out.height);
    imgBuf.data.set(out.data);
    ctx.putImageData(imgBuf, 0, 0);
  }

  const QPF_STOPS = [[0.05, [11, 58, 99]], [0.25, [15, 111, 168]], [0.5, [18, 179, 201]], [1, [61, 220, 132]], [2, [232, 195, 26]], [4, [255, 122, 24]], [8, [255, 45, 64]]];
  const SAT_STOPS = [[-95, [43, 11, 58]], [-75, [90, 18, 117]], [-60, [143, 43, 168]], [-45, [201, 74, 154]], [-32, [224, 224, 224]], [-18, [143, 184, 212]], [-5, [42, 77, 102]]];

  function paintGridPixels(valueFn, colorFn, minVal) {
    const e = state.engine;
    const nx = e.grid.nx;
    const ny = e.grid.ny;
    const kmW = e.domainKm.w;
    const kmH = e.domainKm.h;
    if (!imgBuf || imgBuf.width !== canvasW || imgBuf.height !== canvasH) imgBuf = ctx.createImageData(canvasW, canvasH);
    const data = imgBuf.data;
    data.fill(0);
    for (let py = 0; py < canvasH; py += 1) {
      const yKm = view.y0 + ((py + 0.5) / canvasH) * (view.y1 - view.y0);
      const j = clamp(Math.floor((yKm / kmH) * ny), 0, ny - 1);
      const rowBase = py * canvasW;
      for (let px = 0; px < canvasW; px += 1) {
        const xKm = view.x0 + ((px + 0.5) / canvasW) * (view.x1 - view.x0);
        const i = clamp(Math.floor((xKm / kmW) * nx), 0, nx - 1);
        const v = valueFn(j * nx + i);
        if (v < minVal) continue;
        const c = colorFn(v);
        if (!c) continue;
        const o = (rowBase + px) * 4;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = c[3];
      }
    }
    ctx.putImageData(imgBuf, 0, 0);
  }

  function paintQpf(frame) {
    const g = frame.grid;
    paintGridPixels(
      (idx) => (g.rainAccum[idx] + g.snowAccum[idx]) / 25.4,
      (v) => {
        const c = WX.palettes.ramp(QPF_STOPS, v);
        return [c[0], c[1], c[2], clamp(95 + v * 35, 95, 235)];
      },
      0.05,
    );
  }

  function paintSatellite(frame) {
    const g = frame.grid;
    const snd = state.engine.sounding;
    paintGridPixels(
      (idx) => {
        const ct = g.cloudTop[idx];
        if (ct < 300) return 20;
        const s = snd.at(ct);
        let tb = s ? s.T - 273.15 : -40;
        if (ct > 11000) tb -= Math.min(14, (ct - 11000) / 220);
        return tb;
      },
      (tb) => {
        const c = WX.palettes.ramp(SAT_STOPS, tb);
        return [c[0], c[1], c[2], tb < -18 ? 245 : 140];
      },
      -999,
    );
  }

  function paintReflectivityBackdrop(frame, alpha) {
    const g = frame.grid;
    paintGridPixels(
      (idx) => 10 * Math.log10(Math.max(g.maxReflectivity[idx], 1e-6)),
      (v) => {
        const t = clamp((v - 10) / 55, 0, 1);
        const gr = 40 + 120 * t;
        return [gr * 0.8, gr * 0.88, gr, (70 + 90 * t) * alpha * 2];
      },
      10,
    );
  }

  function paintModel(frame) {
    const e = state.engine;
    const field = e.modelField(getModel(), state.modelField);
    const specs = {
      compz: { min: 5, fn: (v) => { const c = WX.palettes.ramp(WX.palettes.Z_STOPS, v); return [c[0], c[1], c[2], 205]; } },
      uh: { min: 25, fn: (v) => { const t = clamp((v - 25) / 400, 0, 1); return [40 + 215 * t, 160 - 90 * t, 220 - 150 * t, 120 + 120 * t]; } },
      wind10: { min: 25, fn: (v) => { const t = clamp((v - 25) / 75, 0, 1); return [60 + 195 * t, 180 - 100 * t, 230 - 190 * t, 110 + 130 * t]; } },
      hail: { min: 0.5, fn: (v) => { const t = clamp((v - 0.5) / 3.5, 0, 1); return [60 + 195 * t, 220 - 130 * t, 90 - 40 * t, 120 + 125 * t]; } },
      qpf: { min: 0.05, fn: (v) => { const c = WX.palettes.ramp(QPF_STOPS, v); return [c[0], c[1], c[2], clamp(95 + v * 35, 95, 235)]; } },
    };
    const spec = specs[state.modelField] || specs.compz;
    paintGridPixels((idx) => field[idx], spec.fn, spec.min);
  }

  function paintRotation(frame) {
    const e = state.engine;
    const key = `rot|${frame.index}|${state.zoom.toFixed(2)}|${view.x0.toFixed(1)}`;
    let m = rasterCache.get(key);
    if (!m) {
      e.radar.markFrame(frame.index);
      m = e.radar.mrmsGrid([0, 4], frame.index, 3);
      cachePut(key, m);
    }
    ctx.save();
    for (let j = 0; j < m.h; j += 1) {
      for (let i = 0; i < m.w; i += 1) {
        const o = j * m.w + i;
        if (m.Z[o] < 20 || m.rotVel[o] < 8) continue;
        const strength = clamp((m.shear[o] - 8) / 22, 0, 1);
        const rot = m.rot[o];
        const p0 = kmToPx((i * m.step) / 1000, (j * m.step) / 1000);
        const p1 = kmToPx(((i + 1) * m.step) / 1000, ((j + 1) * m.step) / 1000);
        ctx.fillStyle = rot > 0.015 ? `rgba(255,45,64,${0.25 + 0.65 * strength})` : rot > 0.01 ? `rgba(232,195,26,${0.2 + 0.6 * strength})` : `rgba(31,143,74,${0.18 + 0.5 * strength})`;
        ctx.fillRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x) + 1, Math.abs(p1.y - p0.y) + 1);
      }
    }
    ctx.restore();
  }

  /* ──────────────────────────────────────────────── map decorations */
  function drawGeography() {
    const e = state.engine;
    const proj = e.proj || (e.proj = WX.makeProjection(e.site.lat, e.site.lon));
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(90,120,145,0.2)';
    ctx.font = `${9}px var(--mono), monospace`;
    ctx.fillStyle = 'rgba(140,168,190,0.5)';
    const latLo = Math.floor(e.site.lat - 3);
    const latHi = Math.ceil(e.site.lat + 3);
    for (let lat = latLo; lat <= latHi; lat += 1) {
      const xy = proj.toXY(lat, e.site.lon);
      const px = kmToPx(xy.x + e.site.x / 1000, xy.y + e.site.y / 1000);
      if (px.y < 0 || px.y > canvasH) continue;
      ctx.beginPath();
      ctx.moveTo(0, px.y);
      ctx.lineTo(canvasW, px.y);
      ctx.stroke();
      ctx.fillText(`${lat}N`, 4, px.y - 3);
    }
    for (let dLon = -4; dLon <= 4; dLon += 1) {
      const xy = proj.toXY(e.site.lat, e.site.lon + dLon);
      const px = kmToPx(xy.x + e.site.x / 1000, xy.y + e.site.y / 1000);
      if (px.x < 0 || px.x > canvasW) continue;
      ctx.beginPath();
      ctx.moveTo(px.x, 0);
      ctx.lineTo(px.x, canvasH);
      ctx.stroke();
      ctx.fillText(`${Math.abs(e.site.lon + dLon).toFixed(0)}W`, px.x + 3, 11);
    }
    // range rings from the active radar
    const s = kmToPx(e.site.x / 1000, e.site.y / 1000);
    ctx.strokeStyle = 'rgba(120,150,175,0.28)';
    ctx.setLineDash([4, 4]);
    for (const r of [50, 100, 150]) {
      const a = kmToPx(e.site.x / 1000 + r, e.site.y / 1000);
      const b = kmToPx(e.site.x / 1000, e.site.y / 1000 + r);
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, Math.abs(a.x - s.x), Math.abs(b.y - s.y), 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(160,190,215,0.55)';
      ctx.fillText(`${r} km`, s.x + Math.abs(a.x - s.x) * 0.71 + 3, s.y - Math.abs(b.y - s.y) * 0.71);
    }
    ctx.setLineDash([]);
    // neighbouring sites
    for (const site of WX.RADAR_SITES) {
      if (site.id === e.site.id) continue;
      const xy = proj.toXY(site.lat, site.lon);
      const px = kmToPx(xy.x + e.site.x / 1000, xy.y + e.site.y / 1000);
      // only draw sites that are actually inside the current view
      if (px.x < 0 || px.y < 0 || px.x > canvasW || px.y > canvasH) continue;
      ctx.fillStyle = 'rgba(190,215,235,0.8)';
      ctx.beginPath();
      ctx.arc(px.x, px.y, 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(190,215,235,0.6)';
      ctx.fillText(site.id, px.x + 4, px.y + 3);
    }
    // the active antenna
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, TAU);
    ctx.moveTo(s.x - 10, s.y);
    ctx.lineTo(s.x + 10, s.y);
    ctx.moveTo(s.x, s.y - 10);
    ctx.lineTo(s.x, s.y + 10);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px var(--sans), sans-serif';
    ctx.fillText(e.site.id, s.x + 12, s.y - 8);
    ctx.restore();
  }

  function drawStormCells(frame) {
    ctx.save();
    for (const el of frame.elements) {
      const p = kmToPx(el.x / 1000, el.y / 1000);
      const meso = Math.abs(el.zetaLow) > 0.004;
      ctx.strokeStyle = meso ? 'rgba(255,215,64,0.9)' : 'rgba(140,205,255,0.7)';
      ctx.lineWidth = meso ? 1.7 : 1.1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, meso ? 7 : 4.5, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,180,84,0.45)';
    ctx.lineWidth = 1;
    for (const sy of frame.systems) {
      if (sy.members < 2) continue;
      const p = kmToPx(sy.x / 1000, sy.y / 1000);
      const a = kmToPx(sy.x / 1000 + sy.length / 2000, sy.y / 1000);
      const rx = Math.max(8, Math.abs(a.x - p.x));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, rx * 0.55, -sy.angle, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,180,84,0.8)';
      ctx.font = '9.5px var(--sans), sans-serif';
      ctx.fillText(sy.type.toUpperCase(), p.x + rx + 4, p.y + 3);
      ctx.setLineDash([3, 3]);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawTornadoTracks(frame) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const t of frame.tornadoes) {
      if (!t.path || t.path.length < 1) continue;
      for (let i = 1; i < t.path.length; i += 1) {
        const a = kmToPx(t.path[i - 1].x / 1000, t.path[i - 1].y / 1000);
        const b = kmToPx(t.path[i].x / 1000, t.path[i].y / 1000);
        const ef = t.path[i].ef;
        ctx.strokeStyle = ef >= 4 ? '#b46cff' : ef >= 2 ? '#ff2d40' : '#ff9a1f';
        ctx.globalAlpha = t.active ? 0.95 : 0.5;
        ctx.lineWidth = clamp(1.5 + ef * 1.3, 1.5, 8);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (t.active && t.x !== undefined) {
        const p = kmToPx(t.x / 1000, t.y / 1000);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px var(--sans), sans-serif';
        ctx.fillText(`EF${t.ef}`, p.x + 8, p.y - 6);
      }
    }
    ctx.restore();
  }

  /** Local storm reports: small dots with a soft halo, fading with age. */
  function drawReports(frame) {
    const e = state.engine;
    ctx.save();
    for (const r of frame.reports) {
      const age = Math.max(0, state.currentIndex - r.minutes / STEP_MINUTES);
      const radius = clamp(8 - age * 0.16, 4.5, 8);
      const p = kmToPx(r.x / 1000, r.y / 1000);
      if (p.x < -20 || p.y < -20 || p.x > canvasW + 20 || p.y > canvasH + 20) continue;
      const color = REPORT_COLORS[r.type] || '#a7aa9b';
      ctx.globalAlpha = clamp(1 - age * 0.035, 0.35, 1);
      ctx.fillStyle = hexToRgba(color, 0.18);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 4, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      if (r.type === 'tornado' || r.type === 'tornado_sig') {
        ctx.moveTo(p.x, p.y - radius);
        ctx.lineTo(p.x + radius * 0.9, p.y + radius * 0.6);
        ctx.lineTo(p.x - radius * 0.9, p.y + radius * 0.6);
        ctx.closePath();
      } else if (r.type === 'hail' || r.type === 'hail_sig') {
        ctx.arc(p.x, p.y, radius * 0.75, 0, TAU);
      } else {
        ctx.rect(p.x - radius * 0.85, p.y - radius * 0.42, radius * 1.7, radius * 0.84);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawIssuedProducts(frame) {
    ctx.save();
    for (const p of state.products) {
      if (p.start > state.viewIndex || p.end < state.viewIndex) continue;
      const cat = getProduct(p.productId);
      ctx.beginPath();
      p.area.points.forEach((pt, i) => {
        const px = kmToPx(pt.x, pt.y);
        if (i === 0) ctx.moveTo(px.x, px.y);
        else ctx.lineTo(px.x, px.y);
      });
      ctx.closePath();
      ctx.fillStyle = hexToRgba(cat.color, 0.12);
      ctx.strokeStyle = cat.color;
      ctx.lineWidth = 1.8;
      ctx.fill();
      ctx.stroke();
      const b = areaBounds(p.area);
      const corner = kmToPx(b.x1, b.y2);
      ctx.fillStyle = cat.color;
      ctx.font = 'bold 10px var(--sans), sans-serif';
      ctx.fillText(cat.short, corner.x + 4, corner.y);
    }
    ctx.restore();
  }

  function drawSelection() {
    if (!state.selection) return;
    const cat = getProduct();
    ctx.save();
    ctx.beginPath();
    state.selection.points.forEach((pt, i) => {
      const px = kmToPx(pt.x, pt.y);
      if (i === 0) ctx.moveTo(px.x, px.y);
      else ctx.lineTo(px.x, px.y);
    });
    ctx.closePath();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = hexToRgba(cat.color, 0.16);
    ctx.fill();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px var(--sans), sans-serif';
    const b = areaBounds(state.selection);
    const corner = kmToPx(b.x1, b.y2);
    ctx.fillText(cat.short, corner.x + 4, corner.y);
    ctx.restore();
  }

  function drawLegend(layer) {
    const rows = legendRows(layer);
    els.legend.innerHTML = rows
      .map((r) => `<div class="lg-row"><span class="lg-bar" style="background:${r.rgb}"></span>${r.v}${r.unit ? ' ' + r.unit : ''}</div>`)
      .reverse()
      .join('');
  }

  function legendRows(layer) {
    const p = WX.palettes;
    const mk = (stops, lo, hi, unit, n = 6) => {
      const rows = [];
      for (let i = 0; i <= n; i += 1) {
        const v = lo + ((hi - lo) * i) / n;
        const custom = layer.id === 'radar' || layer.id === 'velocity' ? customColor(layer.id, v) : null;
        const c = custom || p.ramp(stops, v);
        rows.push({ v: v.toFixed(unit === 'dBZ' ? 0 : 2), rgb: `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`, unit });
      }
      return rows;
    };
    switch (layer.id) {
      case 'radar':
      case 'composite':
        return mk(p.Z_STOPS, 5, 70, 'dBZ');
      case 'velocity':
        return mk(p.V_STOPS, -50, 50, 'kt');
      case 'cc':
        return mk(p.CC_STOPS, 0.7, 1.0, '');
      case 'ptype':
        return p.PT_COLORS.map((c, i) => ({ v: ['None', 'Rain', 'Mix', 'Snow', 'Hail', 'Dry Snow'][i], rgb: `rgb(${c[0]},${c[1]},${c[2]})`, unit: '' })).slice(1);
      case 'rotation':
        return [0, 3, 6, 10, 15, 22].map((v) => ({ v: v.toFixed(1), rgb: v < 5 ? '#123a5c' : v < 10 ? '#1f8f4a' : v < 16 ? '#e8c31a' : '#ff2d40', unit: '×10⁻³ s⁻¹' }));
      case 'qpf':
        return QPF_STOPS.map((s) => ({ v: s[0].toFixed(2), rgb: `rgb(${s[1][0]},${s[1][1]},${s[1][2]})`, unit: 'in' }));
      case 'satellite':
        return SAT_STOPS.map((s) => ({ v: s[0].toFixed(0), rgb: `rgb(${s[1][0]},${s[1][1]},${s[1][2]})`, unit: '°C' }));
      case 'model':
        return state.modelField === 'compz' ? mk(p.Z_STOPS, 5, 70, 'dBZ') : mk(p.Z_STOPS, 0, 100, '', 4);
      case 'reports':
        return Object.entries(REPORT_COLORS).map(([k, c]) => ({ v: k.replace('_', ' '), rgb: c, unit: '' }));
      default:
        return [];
    }
  }

  /* ───────────────────────────────────────────────────── side panels */
  function renderAll() {
    renderMap();
    renderMetrics();
    renderProducts();
    renderReports();
    renderTruth();
    renderCam();
    renderTimeline();
    els.areaStatus.textContent = state.selection ? `${areaSize(state.selection).toFixed(0)} km² drawn` : 'No area drawn';
    els.areaStatus.className = state.selection ? 'status-chip run' : 'status-chip muted';
    els.issueBtn.disabled = !state.selection;
    els.tempoChip.textContent = tempoLabel();
  }

  function renderMetrics() {
    els.validTime.textContent = formatTime(state.viewIndex);
    els.deskScore.textContent = String(deskScore());
    els.hitCount.textContent = String(state.stats.hits);
    els.falseAlarmCount.textContent = String(state.stats.falseAlarms);
    els.missCount.textContent = String(state.stats.misses);
    els.polygonMeter.value = state.stats.polygonSkill;
    els.leadMeter.value = state.stats.leadSkill;
    els.hazardMeter.value = state.stats.hazardSkill;
    els.accuracyBadge.textContent = `${deskScore()}%`;
    els.siteChip.textContent = state.engine ? `${state.engine.site.id} · ${state.engine.site.city}` : state.siteId;
  }

  function renderProducts() {
    const active = state.products.filter((p) => p.end >= state.viewIndex);
    els.activeCount.textContent = String(active.length);
    if (!state.products.length) {
      els.productList.innerHTML = '<div class="empty-state">You have not issued anything.</div>';
      return;
    }
    els.productList.innerHTML = state.products
      .slice()
      .reverse()
      .slice(0, 24)
      .map((p) => {
        const cat = getProduct(p.productId);
        const v = p.verification;
        const cls = cat.id.includes('tornado') ? (cat.severe ? 'pds' : 'tor') : cat.id.includes('flood') ? 'flood' : '';
        const tag = p.options.impactTag || p.options.watchTag || '';
        const live = p.start <= state.viewIndex && p.end >= state.viewIndex;
        return `<div class="product-item ${cls}">
          <div class="p-head"><span>${cat.short} ${p.number}</span><span class="p-tag verdict-${v.hit ? 'hit' : 'fa'}">${v.hit ? 'HIT +' + v.score : 'FA ' + v.score}</span></div>
          <div class="p-meta">${formatTime(p.start)}–${formatTime(p.end)}${tag ? ' · ' + tag.toUpperCase() : ''}${live ? ' · ACTIVE' : ''}</div>
          <div class="p-meta">poly ${v.polygon} · lead ${v.lead} · hazard ${v.hazard} · ${v.summary}</div>
          ${p.text ? `<details><summary>AWIPS text</summary><pre>${escapeHtml(p.text)}</pre></details>` : ''}
        </div>`;
      })
      .join('');
  }

  function renderReports() {
    const frame = state.engine ? state.engine.frames[clamp(state.viewIndex, 0, state.engine.frames.length - 1)] : null;
    const reports = frame ? frame.reports : [];
    els.reportCount.textContent = String(reports.length);
    if (!reports.length) {
      els.reportList.innerHTML = '<div class="empty-state">No delayed reports yet.</div>';
      return;
    }
    els.reportList.innerHTML = reports
      .slice()
      .reverse()
      .slice(0, 40)
      .map((r) => {
        const color = REPORT_COLORS[r.type] || '#a7aa9b';
        const val = r.unit === 'mph' ? `${r.value} mph` : r.unit === 'in' ? `${Number(r.value).toFixed(2)} in` : r.value;
        return `<div class="report-item ${r.significant ? 'sig' : ''}">
          <span class="r-dot" style="background:${color}"></span>
          <span class="r-body"><span class="r-txt">${r.text}</span><span class="r-val">${formatTime(Math.round(r.minutes / STEP_MINUTES))} · ${val}</span></span>
        </div>`;
      })
      .join('');
  }

  function renderTruth() {
    const hazards = truthHazards(state.viewIndex);
    if (!hazards.length) {
      els.truthList.innerHTML = '<div class="empty-state">Nothing severe at this frame.</div>';
      return;
    }
    els.truthList.innerHTML = hazards
      .slice(0, 12)
      .map((h) => {
        const detail = h.kind === 'wind' ? `${h.mph} mph` : h.kind === 'hail' ? `${h.inches.toFixed(2)} in` : h.kind === 'tornado' ? `EF${h.ef}` : `${h.inches.toFixed(1)} in`;
        return `<div class="truth-item"><span>${h.kind} · ${h.tag}</span><b>${detail} · ${(h.severity * 100).toFixed(0)}%</b></div>`;
      })
      .join('');
  }

  function renderCam() {
    if (!state.engine) return;
    els.modelMeta.textContent = getModel().meta;
    els.camTable.innerHTML = MODELS.map((m) => {
      const field = state.engine.modelField(m, state.modelField);
      let mx = -Infinity;
      for (let i = 0; i < field.length; i += 1) if (field[i] > mx) mx = field[i];
      const unit = state.modelField === 'wind10' ? ' mph' : state.modelField === 'hail' ? ' in' : state.modelField === 'qpf' ? ' in' : state.modelField === 'uh' ? '' : ' dBZ';
      const on = m.id === state.modelId;
      return `<tr><td${on ? ' style="color:#ffb020"' : ''}>${m.name}</td><td>${mx.toFixed(state.modelField === 'compz' || state.modelField === 'uh' ? 0 : 1)}${unit}</td></tr>`;
    }).join('');
  }

  function renderTimeline() {
    // the slider only ever reaches frames that already exist
    const max = Math.max(0, Math.min(state.currentIndex, (state.engine ? state.engine.frames.length : 1) - 1));
    els.timeRange.max = String(max);
    els.timeRange.value = String(state.viewIndex);
    els.timelineStatus.textContent = state.followCurrent ? 'Current scan' : `Reviewing ${formatTime(state.viewIndex)} (live ${formatTime(state.currentIndex)})`;
    const labels = [];
    const n = 4;
    for (let i = 0; i <= n; i += 1) labels.push(formatTime(Math.round((max * i) / n)));
    els.timelineLabels.innerHTML = labels.map((l) => `<span>${l}</span>`).join('');
  }

  function updateBriefing() {
    const c = getCase();
    els.caseSubtitle.textContent = c.name;
    els.briefing.textContent = c.brief;
  }

  function updateParamTable() {
    const m = state.engine.sounding.metrics;
    const rows = [
      ['MLCAPE', `${Math.round(m.cape)} J/kg`],
      ['CIN', `${Math.round(m.cin)} J/kg`],
      ['LCL', `${Math.round(m.lcl)} m`],
      ['DCAPE', `${Math.round(m.dcape)} J/kg`],
      ['0–3 SRH', `${Math.round(m.srh03)} m²/s²`],
      ['0–6 shear', `${m.shear06.toFixed(0)} kt`],
      ['Freezing lvl', `${(m.freezing / 1000).toFixed(1)} km`],
      ['Sig Tornado P', `<b>${m.stp.toFixed(1)}</b>`],
      ['Sig Severe P', `${m.scp.toFixed(1)}`],
      ['Storm motion', `${Math.round(m.motion.speed * 1.94384)} kt ${Math.round(m.motion.met)}°`],
    ];
    els.paramTable.innerHTML = rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
  }

  function drawSounding() {
    const cv = els.soundingCanvas;
    const c = cv.getContext('2d');
    const W = cv.width || 264;
    const H = cv.height || 196;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#080e14';
    c.fillRect(0, 0, W, H);
    const snd = state.engine.sounding;
    const p = snd.profile;
    const X = (t) => ((t + 40) / 85) * (W - 20) + 16;
    const Y = (z) => H - 12 - (z / 16000) * (H - 24);
    c.strokeStyle = 'rgba(90,120,145,0.18)';
    c.lineWidth = 1;
    c.font = '8px monospace';
    c.fillStyle = 'rgba(140,168,190,0.5)';
    for (let t = -40; t <= 40; t += 20) {
      c.beginPath();
      c.moveTo(X(t), Y(0));
      c.lineTo(X(t), Y(16000));
      c.stroke();
      c.fillText(`${t}`, X(t) - 6, H - 3);
    }
    for (let z = 0; z <= 16000; z += 4000) {
      c.beginPath();
      c.moveTo(16, Y(z));
      c.lineTo(W - 3, Y(z));
      c.stroke();
      c.fillText(`${z / 1000}k`, 1, Y(z) + 3);
    }
    c.strokeStyle = '#ff5c5c';
    c.lineWidth = 1.7;
    c.beginPath();
    for (let k = 0; k < p.z.length; k += 1) {
      const x = X(p.T[k] - 273.15);
      const y = Y(p.z[k]);
      if (k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.strokeStyle = '#5ad1ff';
    c.beginPath();
    for (let k = 0; k < p.z.length; k += 1) {
      const x = X(WX.dewpointFromQ(p.qv[k], p.p[k]));
      const y = Y(p.z[k]);
      if (k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    // hodograph inset
    const hx = W - 48;
    const hy = 48;
    const hr = 34;
    c.strokeStyle = 'rgba(90,120,145,0.35)';
    c.beginPath();
    c.arc(hx, hy, hr, 0, TAU);
    c.stroke();
    c.strokeStyle = '#5ad1ff';
    c.lineWidth = 1.4;
    c.beginPath();
    for (let z = 0; z <= 6300; z += 300) {
      const w = snd.windAt(z);
      const x = hx + (w.u / 35) * hr;
      const y = hy - (w.v / 35) * hr;
      if (z === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    const mo = snd.metrics.motion;
    c.fillStyle = '#ffb454';
    c.beginPath();
    c.arc(hx + (mo.u / 35) * hr, hy - (mo.v / 35) * hr, 2.2, 0, TAU);
    c.fill();
  }

  /* ──────────────────────────────────────────────────── interaction */
  function canvasPoint(ev) {
    const rect = els.weatherCanvas.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * canvasW;
    const py = ((ev.clientY - rect.top) / rect.height) * canvasH;
    return pxToKm(px, py);
  }

  function startSelection(ev) {
    if (ev.button !== 0) return;
    const pt = canvasPoint(ev);
    state.areaMode = getProductOptionValues(true).areaShape || state.areaMode;
    state.drawing = { start: pt, current: pt, mode: state.areaMode };
    state.selection = selectionFromDrag(pt, pt, state.areaMode);
    els.weatherCanvas.setPointerCapture(ev.pointerId);
    renderMap();
    els.areaStatus.textContent = 'Drawing…';
    els.areaStatus.className = 'status-chip warn';
    els.issueBtn.disabled = true;
  }
  function moveSelection(ev) {
    if (!state.drawing) return;
    state.drawing.current = canvasPoint(ev);
    state.selection = selectionFromDrag(state.drawing.start, state.drawing.current, state.drawing.mode);
    renderMap();
  }
  function endSelection(ev) {
    if (!state.drawing) return;
    state.drawing = null;
    if (state.selection && areaSize(state.selection) < 4) state.selection = null;
    renderAll();
  }

  function onWheel(ev) {
    ev.preventDefault();
    const before = canvasPoint(ev);
    state.zoom = clamp(state.zoom * (ev.deltaY < 0 ? 1.18 : 1 / 1.18), 1, 8);
    applyZoom();
    // keep the cursor anchored
    const after = canvasPoint(ev);
    const dx = before.x - after.x;
    const dy = before.y - after.y;
    view.x0 += dx;
    view.x1 += dx;
    view.y0 += dy;
    view.y1 += dy;
    renderMap();
  }

  function showContextMenu(ev) {
    ev.preventDefault();
    const e = state.engine;
    const rect = els.mapShell.getBoundingClientRect();
    const km = canvasPoint(ev);
    const proj = WX.makeProjection(e.site.lat, e.site.lon);
    const ll = proj.toLatLon(km.x - e.site.x / 1000, km.y - e.site.y / 1000);
    const range = Math.hypot(km.x - e.site.x / 1000, km.y - e.site.y / 1000);
    const bearing = ((Math.atan2(km.x - e.site.x / 1000, km.y - e.site.y / 1000) * 180) / Math.PI + 360) % 360;
    const near = WX.nearestSites(ll.lat, ll.lon, 6).map((n) => ({ ...n.site, distance: n.km }));
    const menu = els.ctxMenu;
    menu.innerHTML = `
      <div class="ctx-label">Coordinates</div>
      <div class="ctx-item" data-act="copy-ll"><span>${ll.lat.toFixed(4)}°, ${ll.lon.toFixed(4)}°</span><span class="k">copy</span></div>
      <div class="ctx-item" data-act="copy-rb"><span>${range.toFixed(1)} km @ ${bearing.toFixed(0)}° from ${e.site.id}</span><span class="k">copy</span></div>
      <div class="ctx-item" data-act="drop-pin"><span>Draw area centred here</span><span class="k">↵</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-label">Switch radar site — same storms, new view</div>
      ${near.map((s) => `<div class="ctx-item" data-act="site" data-id="${s.id}"><span>${s.id} — ${s.city}, ${s.state}</span><span class="k">${s.distance.toFixed(0)} km</span></div>`).join('')}
      <div class="ctx-item" data-act="all-sites"><span>Browse all ${WX.RADAR_SITES.length} sites…</span><span class="k">↵</span></div>
    `;
    menu.hidden = false;
    menu.style.left = `${Math.min(ev.clientX - rect.left, rect.width - menu.offsetWidth - 6)}px`;
    menu.style.top = `${Math.min(ev.clientY - rect.top, rect.height - menu.offsetHeight - 6)}px`;
    menu.onclick = (e2) => {
      const item = e2.target.closest('.ctx-item');
      if (!item) return;
      const act = item.dataset.act;
      if (act === 'copy-ll') copyText(`${ll.lat.toFixed(4)}, ${ll.lon.toFixed(4)}`);
      else if (act === 'copy-rb') copyText(`${range.toFixed(1)} km @ ${bearing.toFixed(0)}° from ${e.site.id} (${ll.lat.toFixed(4)}, ${ll.lon.toFixed(4)})`);
      else if (act === 'drop-pin') dropPin(km);
      else if (act === 'site') switchSite(item.dataset.id);
      else if (act === 'all-sites') showAllSites();
      menu.hidden = true;
    };
  }

  function dropPin(km) {
    const w = 14;
    const h = 9;
    state.areaMode = getProductOptionValues(true).areaShape || 'county';
    state.selection = selectionFromDrag({ x: km.x - w / 2, y: km.y - h / 2 }, { x: km.x + w / 2, y: km.y + h / 2 }, state.areaMode);
    renderAll();
  }

  function showAllSites() {
    const menu = els.ctxMenu;
    const grouped = {};
    for (const s of WX.RADAR_SITES) (grouped[s.state || '??'] = grouped[s.state || '??'] || []).push(s);
    menu.innerHTML = `<div class="ctx-label">All WSR-88D sites — the simulation keeps running</div>
      <div class="ctx-scroll">${Object.keys(grouped).sort()
        .map((st) => `<div class="ctx-label">${st}</div>` + grouped[st].map((s) => `<div class="ctx-item" data-act="site" data-id="${s.id}"><span>${s.id} — ${s.city}</span><span class="k">${s.elevM} m</span></div>`).join(''))
        .join('')}</div>`;
    menu.hidden = false;
    menu.style.left = '20px';
    menu.style.top = '20px';
  }

  /** Moving the antenna re-renders the same simulation. Nothing restarts. */
  function switchSite(id) {
    const site = WX.siteById(id);
    if (!site) return;
    state.siteId = id;
    state.engine.setSite(site);
    state.engine.proj = WX.makeProjection(site.lat, site.lon);
    rasterCache.clear();
    buildTilts();
    toast(`Radar → ${site.id} (${site.city})`, '');
    renderAll();
  }

  function copyText(t) {
    if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
    toast(`Copied ${t}`, '');
  }

  let toastTimer = null;
  function toast(text, kind) {
    els.toast.textContent = text;
    els.toast.className = `toast ${kind || ''}`;
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, kind ? 2600 : 1600);
  }

  /* ─────────────────────────────────────────────────────── utilities */
  function formatTime(index) {
    const startHour = 20;
    const total = startHour * 60 + index * STEP_MINUTES;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}Z`;
  }
  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
  function setChip(el, text, cls) {
    el.textContent = text;
    el.className = `status-chip ${cls || ''}`;
  }

  /* ─────────────────────────────────────────────────────────── wiring */
  const IDS = [
    'caseSelect', 'caseSubtitle', 'simChip', 'tempInput', 'dewpointInput', 'shearInput', 'capeInput',
    'helicityInput', 'dcapeInput', 'runBtn', 'briefing', 'soundingCanvas', 'soundingMeta', 'paramTable',
    'palTarget', 'palFile', 'palStatus', 'clearPalBtn', 'productSelect', 'productOptions', 'clearAreaBtn',
    'issueBtn', 'areaStatus', 'accuracyBadge', 'polygonMeter', 'leadMeter', 'hazardMeter', 'lastVerdict',
    'layerTabs', 'tiltSelect', 'modelSelect', 'modelProductSelect', 'stepBackBtn', 'playBtn', 'stepForwardBtn',
    'mapShell', 'weatherCanvas', 'legend', 'cursorReadout', 'ctxMenu', 'toast', 'timeRange', 'timelineStatus',
    'timelineLabels', 'camTable', 'modelMeta', 'productList', 'activeCount', 'reportList', 'reportCount',
    'truthList', 'validTime', 'deskScore', 'hitCount', 'falseAlarmCount', 'missCount', 'tempoChip', 'siteBtn', 'siteChip',
  ];

  function boot() {
    IDS.forEach((id) => { els[id] = document.getElementById(id); });

    els.caseSelect.innerHTML = CASES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
    els.caseSelect.value = state.caseId;
    els.caseSelect.addEventListener('change', (e) => {
      state.caseId = e.target.value;
      const c = getCase();
      state.siteId = c.site;
      els.tempInput.value = c.s.temperature;
      els.dewpointInput.value = c.s.dewpoint;
      els.shearInput.value = c.s.shear;
      els.capeInput.value = c.s.cape;
      els.helicityInput.value = c.s.helicity;
      els.dcapeInput.value = c.s.dcape;
      updateBriefing();
      startShift();
    });

    els.layerTabs.innerHTML = LAYERS.map((l) => `<button type="button" data-layer="${l.id}"${l.id === state.layer ? ' class="active"' : ''}>${l.name}</button>`).join('');
    els.layerTabs.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        state.layer = b.dataset.layer;
        els.layerTabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        renderMap();
        els.cursorReadout.textContent = (LAYERS.find((l) => l.id === state.layer) || {}).label || '';
      }),
    );

    els.productSelect.innerHTML = PRODUCTS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
    els.productSelect.value = state.selectedProduct;
    els.productSelect.addEventListener('change', (e) => {
      state.selectedProduct = e.target.value;
      renderProductOptions();
      renderMap();
    });
    els.modelSelect.innerHTML = MODELS.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
    els.modelSelect.addEventListener('change', (e) => { state.modelId = e.target.value; rasterCache.clear(); renderAll(); });
    els.modelProductSelect.innerHTML = MODEL_FIELDS.map((f) => `<option value="${f.id}">${f.name}</option>`).join('');
    els.modelProductSelect.addEventListener('change', (e) => { state.modelField = e.target.value; renderAll(); });

    els.runBtn.addEventListener('click', () => {
      state.seed = Math.floor(Math.random() * 100000);
      startShift();
    });
    els.issueBtn.addEventListener('click', issueProduct);
    els.clearAreaBtn.addEventListener('click', () => { state.selection = null; renderAll(); });

    els.palFile.addEventListener('change', async () => {
      const file = els.palFile.files && els.palFile.files[0];
      if (!file) return;
      const pal = parsePal(await file.text());
      if (!pal) {
        toast('Could not parse that .pal', 'fa');
        return;
      }
      state.customPalettes[els.palTarget.value] = pal;
      els.palStatus.textContent = `${els.palTarget.value}: ${pal.name}`;
      els.palStatus.className = 'status-chip run';
      rasterCache.clear();
      renderMap();
      toast(`Palette loaded (${pal.name})`, 'hit');
    });
    els.clearPalBtn.addEventListener('click', () => {
      state.customPalettes[els.palTarget.value] = null;
      els.palStatus.textContent = 'Default';
      els.palStatus.className = 'status-chip muted';
      rasterCache.clear();
      renderMap();
    });

    els.stepBackBtn.addEventListener('click', () => { stopPlay(); advance(-1); });
    els.stepForwardBtn.addEventListener('click', () => { stopPlay(); advance(1); });
    els.playBtn.addEventListener('click', () => (state.playing ? stopPlay() : startPlay()));
    els.timeRange.addEventListener('input', (e) => setFrame(+e.target.value));

    els.tiltSelect.addEventListener('change', (e) => { state.tilt = +e.target.value; rasterCache.clear(); renderMap(); });

    els.weatherCanvas.addEventListener('pointerdown', startSelection);
    els.weatherCanvas.addEventListener('pointermove', (ev) => {
      moveSelection(ev);
      const km = canvasPoint(ev);
      const s = state.engine.sampleCursor(km.x, km.y);
      const e = state.engine;
      const proj = WX.makeProjection(e.site.lat, e.site.lon);
      const ll = proj.toLatLon(km.x - e.site.x / 1000, km.y - e.site.y / 1000);
      els.cursorReadout.textContent = `${ll.lat.toFixed(3)}° ${ll.lon.toFixed(3)}° · ${s.rangeKm.toFixed(0)} km ${s.bearing.toFixed(0)}° from ${e.site.id} · ${s.T.toFixed(0)}/${s.Td.toFixed(0)}°C · SRV wind ${s.windMph.toFixed(0)} mph · updraft ${s.updraft.toFixed(0)} m/s · MESH ${s.hailIn.toFixed(2)} in`;
    });
    els.weatherCanvas.addEventListener('pointerup', endSelection);
    els.weatherCanvas.addEventListener('pointercancel', endSelection);
    els.weatherCanvas.addEventListener('contextmenu', showContextMenu);
    els.weatherCanvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('click', (ev) => {
      if (!els.ctxMenu.contains(ev.target)) els.ctxMenu.hidden = true;
    });
    els.siteBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      showAllSites();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT') return;
      if (ev.key === ' ') {
        ev.preventDefault();
        els.playBtn.click();
      } else if (ev.key === 'ArrowRight') advance(1);
      else if (ev.key === 'ArrowLeft') advance(-1);
      else if (ev.key === 'Enter' && state.selection) issueProduct();
      else if (ev.key === 'Escape') { state.selection = null; els.ctxMenu.hidden = true; renderAll(); }
      else if (ev.key >= '1' && ev.key <= '9') {
        const l = LAYERS[+ev.key - 1];
        if (l) {
          state.layer = l.id;
          els.layerTabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.layer === l.id));
          renderMap();
        }
      }
    });

    window.addEventListener('resize', () => { fitCanvas(); applyZoom(); renderMap(); });

    fitCanvas();
    renderProductOptions();
    startShift();

    // repaint at a modest rate so the live view stays current without blocking
    setInterval(() => {
      if (state.engine && state.engine.frames.length - 1 > state.viewIndex && state.followCurrent) renderAll();
    }, 900);
  }

  function buildTilts() {
    const e = state.engine;
    els.tiltSelect.innerHTML = e.radar.tilts.map((t, i) => `<option value="${i}"${i === state.tilt ? ' selected' : ''}>${t.toFixed(1)}°</option>`).join('');
  }

  /* Test/debug surface — lets the pipeline be driven headlessly. */
  window.WM = {
    state, els, view, boot, buildEngine, startShift, advance, setFrame, renderAll, renderMap,
    issueProduct, verifyProduct, checkMisses, truthHazards, selectionFromDrag, areaHazardOverlap,
    parsePal, switchSite, deskScore, getProduct, getCase, CASES, PRODUCTS, LAYERS, buildTilts,
  };

  // tilt list needs an engine; build one synchronously before the first paint
  const _boot = () => {
    boot();
    buildTilts();
    renderAll();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot);
  else _boot();
})();
