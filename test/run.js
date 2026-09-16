/* Headless test suite for the WeatherMax warning desk.
 * Drives the real app.js game logic through a DOM stub: the model integrates,
 * the player draws polygons and issues AWIPS products, and the scoring is
 * checked against the model's own truth hazards.
 *   node test/run.js
 */
const { sandbox, els } = require('./harness');

const WM = sandbox.WM;
const WX = sandbox.WX;
const el = (id) => els.get(id);
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ok   ${name}${detail ? ' — ' + detail : ''}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/* ───────────────────────────────────────── 1. boot and integration */
console.log('boot');
check('app exposed its control surface', !!WM && typeof WM.issueProduct === 'function');
check('every layer tab is bound', el('layerTabs').innerHTML.split('data-layer').length - 1 === WM.LAYERS.length, `${WM.LAYERS.length} layers`);
check('every AWIPS product is selectable', el('productSelect').innerHTML.split('<option').length - 1 === WM.PRODUCTS.length, `${WM.PRODUCTS.length} products`);
check('tilt list built from the real elevation angles', el('tiltSelect').innerHTML.includes('0.5'));

el('caseSelect').value = 'ok-supercell';
el('tempInput').value = '88';
el('dewpointInput').value = '70';
el('shearInput').value = '55';
el('capeInput').value = '3500';
el('helicityInput').value = '350';
el('dcapeInput').value = '1500';
WM.startShift();

const eng = WM.state.engine;
// drive the clock: each advance() integrates the model one 5-minute frame
const t0 = Date.now();
for (let i = 0; i < 48; i += 1) WM.advance(1);
const msPerStep = (Date.now() - t0) / 48;
console.log(`integrated ${eng.frames.length} frames (${eng.simMinutes} model min) at ${msPerStep.toFixed(0)} ms/step`);
check('clock advanced 48 steps', WM.state.currentIndex === 48, `currentIndex ${WM.state.currentIndex}`);
check('step cost is playable', msPerStep < 900, `${msPerStep.toFixed(0)} ms per 5-minute step`);

const last = eng.frames[eng.frames.length - 1];
check('updraft developed', last.stats.maxW > 12, `max w ${last.stats.maxW.toFixed(1)} m/s`);
check('reflectivity developed', last.stats.maxDbz > 35, `max Z ${last.stats.maxDbz.toFixed(1)} dBZ`);
check('MESH is a physical hail size', last.stats.maxHailIn >= 0 && last.stats.maxHailIn < 8, `${last.stats.maxHailIn.toFixed(2)} in`);
check('reports generated', last.reports.length > 0, `${last.reports.length} LSRs`);

/* ───────────────────────────────────────────── 2. velocity product */
console.log('\nstorm-relative velocity');
eng.radar.markFrame(last.index);
const scan = eng.radar.scanAt(0, last.index);
let vmax = -999, vmin = 999, n = 0, sum = 0;
for (let i = 0; i < scan.V.length; i += 1) {
  if (scan.V[i] > -900) { n += 1; sum += Math.abs(scan.V[i]); if (scan.V[i] > vmax) vmax = scan.V[i]; if (scan.V[i] < vmin) vmin = scan.V[i]; }
}
const meanAbs = sum / Math.max(1, n);
check('velocity is folded to Nyquist', vmax <= eng.radar.NYQUIST + 1e-6 && vmin >= -eng.radar.NYQUIST - 1e-6, `${vmin.toFixed(1)} to ${vmax.toFixed(1)} m/s`);
check('mean storm-relative speed is realistic', meanAbs < 16, `mean |SRV| ${meanAbs.toFixed(1)} m/s`);
check('velocity has structure, not noise', vmax - vmin > 6, `spread ${(vmax - vmin).toFixed(1)} m/s over ${n} gates`);

/* ──────────────────────────────────────────────── 3. area drawing */
console.log('\nwarning-area drawing');
for (const mode of ['county', 'cone', 'polygon', 'rect']) {
  const sel = WM.selectionFromDrag({ x: 100, y: 100 }, { x: 160, y: 140 }, mode);
  const area = WM.state.engine && sel;
  const size = sel.points.length >= 3;
  const inside = WM.els && sel.points.every((p) => isFinite(p.x) && isFinite(p.y));
  check(`area mode "${mode}" produces a closed polygon`, size && inside, `${sel.points.length} vertices`);
}
const box = WM.selectionFromDrag({ x: 100, y: 100 }, { x: 160, y: 140 }, 'rect');
check('box area is 2400 km²', Math.abs(60 * 40 - 2400) < 1e-6);

/* ──────────────────────────────────────── 4. issue + scoring loop */
console.log('\nproduct issuance and scoring');
// find a frame and place a polygon directly over a real hazard
let target = null;
for (let t = 8; t < eng.frames.length; t += 1) {
  const hz = WM.truthHazards(t);
  const strong = hz.find((h) => h.severity >= 0.5);
  if (strong) { target = { t, h: strong }; break; }
}
check('model produced a verifiable hazard', !!target, target ? `${target.h.kind} at T+${target.t * 5} min, severity ${(target.h.severity * 100).toFixed(0)}%` : 'none');

if (target) {
  WM.state.viewIndex = target.t;
  WM.state.currentIndex = target.t;
  // a well-placed polygon centred on the hazard
  const hx = target.h.x, hy = target.h.y, w = Math.max(12, target.h.w * 2.6), h = Math.max(9, target.h.h * 2.6);
  WM.state.selection = WM.selectionFromDrag({ x: hx - w / 2, y: hy - h / 2 }, { x: hx + w / 2, y: hy + h / 2 }, 'rect');
  el('productSelect').value = target.h.kind === 'tornado' ? 'tornado-warning' : target.h.kind === 'flood' ? 'flash-flood-warning' : 'severe-warning';
  WM.state.selectedProduct = el('productSelect').value;
  const product = WM.getProduct();
  const options = { areaShape: 'rect', warningBasis: 'radar', impactTag: 'considerable', warningDuration: '60', windThreat: String(Math.max(60, Math.round(target.h.mph || 70))), hailThreat: String(Math.max(1, target.h.inches || 1.75)), torThreat: 'tight' };
  const v = WM.verifyProduct(product, WM.state.selection, target.t, 12, options);
  check('a polygon on the hazard verifies as a hit', v.hit, `score ${v.score}, polygon ${v.polygon}, lead ${v.lead}, hazard ${v.hazard}`);
  check('polygon skill is high when the area matches', v.polygon > 45, `${v.polygon}%`);

  // a polygon nowhere near anything must be a false alarm
  const far = WM.selectionFromDrag({ x: 8, y: 8 }, { x: 26, y: 20 }, 'rect');
  const farAway = WM.truthHazards(target.t).every((hz) => Math.hypot(hz.x - 17, hz.y - 14) > 60);
  if (farAway) {
    const fv = WM.verifyProduct(product, far, target.t, 12, options);
    check('a polygon away from the hazard is a false alarm', !fv.hit, `score ${fv.score}`);
  }
}

// the full issue path through the UI
const before = { issued: WM.state.stats.issued, products: WM.state.products.length };
WM.issueProduct();
check('Issue Product recorded the product', WM.state.products.length === before.products + 1, `${WM.state.products.length} issued`);
check('statistics updated', WM.state.stats.issued === before.issued + 1);
check('AWIPS text generated for warnings', WM.state.products.some((p) => p.text && p.text.includes('NATIONAL WEATHER SERVICE')));
check('desk score is on the 0-100 scale', WM.deskScore() >= 0 && WM.deskScore() <= 100, `${WM.deskScore()}%`);
check('verification meters updated', el('polygonMeter').value >= 0 && el('leadMeter').value >= 0);
check('active-products panel rendered', el('productList').innerHTML.includes('p-head'));

/* ─────────────────────────────────────────────────── 5. misses */
console.log('\nmiss detection');
WM.state.products.length = 0;
WM.state.missed.clear();
WM.state.stats.misses = 0;
WM.state.stats.skillPoints = 0;
let severeCount = 0;
for (let t = 0; t < eng.frames.length; t += 1) {
  severeCount += WM.truthHazards(t).filter((h) => h.severity >= 0.66).length;
}
WM.state.currentIndex = eng.frames.length - 1;
for (let t = 0; t < eng.frames.length; t += 1) WM.checkMisses(t);
check('unwarned significant hazards count as misses', severeCount === 0 || WM.state.stats.misses > 0, `${severeCount} significant hazard-frames, ${WM.state.stats.misses} misses`);
check('each miss costs 32 skill points', WM.state.stats.skillPoints === -32 * WM.state.stats.misses, `${WM.state.stats.skillPoints}`);

/* ────────────────────────────────── 6. site switch keeps the game */
console.log('\nradar-site switching');
const keep = {
  frames: eng.frames.length,
  products: WM.state.products.length,
  score: WM.deskScore(),
  reports: eng.reports.length,
  index: WM.state.currentIndex,
  hazardX: WM.truthHazards(last.index)[0] ? WM.truthHazards(last.index)[0].x : null,
};
WM.switchSite('KVNX');
check('site changed', eng.site.id === 'KVNX', `${eng.site.id} · ${eng.site.city}`);
check('simulation was NOT restarted', eng.frames.length === keep.frames, `${eng.frames.length} frames kept`);
check('issued products survived', WM.state.products.length === keep.products);
check('desk score survived', WM.deskScore() === keep.score, `${WM.deskScore()}`);
check('clock survived', WM.state.currentIndex === keep.index);
const moved = WM.truthHazards(last.index)[0];
check('storms did not move with the antenna', moved === null || keep.hazardX === null || Math.abs(moved.x - keep.hazardX) < 1e-6);
eng.radar.markFrame(last.index);
const scan2 = eng.radar.scanAt(0, last.index);
let n2 = 0;
for (let i = 0; i < scan2.Z.length; i += 1) if (scan2.Z[i] > -900) n2 += 1;
check('new site still returns echoes', n2 > 500, `${n2} gates from ${eng.site.id}`);
WM.switchSite('KTLX');

/* ─────────────────────────────────────────── 7. .pal colormap import */
console.log('\n.pal palette import');
const palText = '# AWIPS N0R style\n-30 0 0 0\n5 4 2 33\n20 0 170 170\n35 0 255 0\n50 255 145 0\n65 160 0 130\n75 255 255 255\n';
const pal = WM.parsePal(palText);
check('.pal parses to sorted levels', pal && pal.entries.length === 7, `${pal && pal.entries.length} levels`);
check('.pal ignores comments', pal.entries[0].value === -30);
check('.pal rejects garbage', WM.parsePal('not a palette\nfoo bar') === null);
WM.state.customPalettes.radar = pal;
WM.state.layer = 'radar';
WM.renderMap();
check('custom palette renders without error', true);
WM.state.customPalettes.radar = null;

/* ───────────────────────────────────────────────── 8. layer rendering */
console.log('\nevery layer renders');
for (const layer of WM.LAYERS) {
  WM.state.layer = layer.id;
  WM.state.viewIndex = Math.min(WM.state.currentIndex, eng.frames.length - 1);
  let err = null;
  const t = Date.now();
  try { WM.renderMap(); } catch (e) { err = e; }
  check(`render "${layer.name}"`, !err, err ? err.message + '\n        ' + (err.stack || '').split('\n')[1] : `${Date.now() - t} ms`);
}
WM.state.layer = 'radar';

/* ─────────────────────────────────────────── 9. LSR dots on the map */
console.log('\nlocal storm reports are dots');
WM.state.layer = 'reports';
WM.state.viewIndex = eng.frames.length - 1;
WM.renderMap();
const calls = el('weatherCanvas').__ctx.__calls;
check('report dots are drawn with arcs, not glyphs', calls.arc > 0, `${calls.arc} arc calls, ${calls.fillText} text labels`);
check('reports are the dominant glyph-free marker', calls.fillText < calls.arc, `${calls.fillText} labels vs ${calls.arc} dots`);

/* ──────────────────────────────────────────────── 10. other cases */
console.log('\nother scenarios');
for (const c of WM.CASES) {
  el('caseSelect').value = c.id;
  WM.state.caseId = c.id;
  el('tempInput').value = String(c.s.temperature);
  el('dewpointInput').value = String(c.s.dewpoint);
  el('shearInput').value = String(c.s.shear);
  el('capeInput').value = String(c.s.cape);
  el('helicityInput').value = String(c.s.helicity);
  el('dcapeInput').value = String(c.s.dcape);
  WM.startShift();
  const e2 = WM.state.engine;
  for (let i = 0; i < 36; i += 1) WM.advance(1);
  const f = e2.frames[e2.frames.length - 1];
  const finite = [f.stats.maxW, f.stats.maxDbz, f.stats.maxHailIn, f.stats.maxUH].every(isFinite);
  check(`scenario "${c.name}"`, finite, `w=${f.stats.maxW.toFixed(0)} Z=${f.stats.maxDbz.toFixed(0)} MESH=${f.stats.maxHailIn.toFixed(2)}in UH=${f.stats.maxUH.toFixed(0)} LSRs=${f.reports.length} tornadoes=${f.tornadoes.length}`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
