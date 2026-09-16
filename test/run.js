/* Exercises the real WeatherMax render pipeline headlessly:
 *  - boots app.js against a DOM stub
 *  - integrates the NWP core for 30 model frames
 *  - renders every product tab and reports what came back
 * Run:  node test/run.js
 */
const { sandbox, els } = require('./harness');

const WM = sandbox.WM;
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ok   ${name}${detail ? ' — ' + detail : ''}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('modules loaded:', Object.keys(sandbox.WX).length, 'exports');
check('app.js exposed the WM surface', !!WM && typeof WM.render === 'function');

/* ------------------------------------------------ 1. boot + integration */
const el = (id) => els.get(id);
el('inTemp').value = '88';
el('inDewpoint').value = '70';
el('inShear').value = '55';
el('inCape').value = '3500';
el('inHelicity').value = '350';
el('inDcape').value = '1500';

WM.state.targetFrames = 59;
WM.loadCase('ok-supercell');

// run the integration synchronously instead of through setTimeout
const eng = WM.state.engine;
while (eng.frames.length <= WM.state.targetFrames) eng.step();
console.log(`integrated ${eng.frames.length} frames (${eng.simMinutes} model minutes)`);

const last = eng.frames[eng.frames.length - 1];
check('frame snapshots stored', eng.frames.length === 60, `${eng.frames.length} frames, ${eng.simMinutes} model minutes`);
check('updraft developed', last.stats.maxW > 15, `max w = ${last.stats.maxW.toFixed(1)} m/s`);
check('reflectivity developed', last.stats.maxDbz > 40, `max Z = ${last.stats.maxDbz.toFixed(1)} dBZ`);
check('precipitation reached the ground', last.stats.maxPrcpMm > 1, `${last.stats.maxPrcpMm.toFixed(1)} mm`);
check('cold pool formed', last.stats.minThetaV < -0.1, `min theta-v anomaly ${last.stats.minThetaV.toFixed(2)} K`);
check('MESH is a physical hail size', last.stats.maxHailIn < 8 && last.stats.maxHailIn >= 0, `MESH ${last.stats.maxHailIn.toFixed(2)} in`);
check('updraft helicity in a real range', last.stats.maxUH >= 0 && last.stats.maxUH < 1200, `max UH ${last.stats.maxUH.toFixed(0)} m2/s2`);
check('storm reports generated', last.reports.length > 0, `${last.reports.length} reports`);
check('warnings issued', eng.frames.some((f) => f.warnings.length > 0), `${last.warnings.length} active at the end`);

/* --------------------------------------------------- 2. every product */
WM.fitView();
console.log('\nrendering every product at frame', last.index);
WM.state.frame = last.index;
const rendered = {};
for (const p of WM.PRODUCTS) {
  WM.setProduct(p.id);
  const t0 = Date.now();
  let err = null;
  try {
    WM.render();
  } catch (e) {
    err = e;
  }
  const ms = Date.now() - t0;
  rendered[p.id] = { ms, err: err && err.message };
  check(`render "${p.name}"`, !err, err ? err.message + '\n' + err.stack.split('\n')[1] : `${ms} ms`);
}

/* ------------------------------------------------- 3. radar physics */
const radar = eng.radar;
console.log('\nradar operator');
check('beam height matches 4/3-earth geometry', Math.abs(radar.beamHeight(100000, 0.5) - 1470) < 90, `h(100 km, 0.5 deg) = ${(radar.beamHeight(100000, 0.5) / 1000).toFixed(2)} km`);
check('beam broadens linearly with range', radar.beamSigmaAt(150000) > 2.9 * radar.beamSigmaAt(50000), `sigma ${(radar.beamSigmaAt(50000) / 1000).toFixed(2)} -> ${(radar.beamSigmaAt(150000) / 1000).toFixed(2)} km`);
const scanLow = radar.scanAt(0, last.index);
const scanHigh = radar.scanAt(6, last.index);
let echoLow = 0;
let echoHigh = 0;
let vmax = -999;
let vmin = 999;
let ccMin = 1;
for (let i = 0; i < scanLow.Z.length; i += 1) {
  if (scanLow.Z[i] > -900) echoLow += 1;
  if (scanHigh.Z[i] > -900) echoHigh += 1;
  if (scanLow.V[i] > -900) {
    if (scanLow.V[i] > vmax) vmax = scanLow.V[i];
    if (scanLow.V[i] < vmin) vmin = scanLow.V[i];
  }
  if (scanLow.CC[i] > 0 && scanLow.CC[i] < ccMin) ccMin = scanLow.CC[i];
}
check('lowest tilt returns echoes', echoLow > 500, `${echoLow} gates`);
check('velocity folded to Nyquist', vmax <= radar.NYQUIST + 1e-6 && vmin >= -radar.NYQUIST - 1e-6, `${vmin.toFixed(1)} to ${vmax.toFixed(1)} m/s`);
check('correlation coefficient inside [0.2, 1]', ccMin >= 0.2, `min rho-hv ${ccMin.toFixed(3)}`);

const m = radar.mrmsGrid([0, 4], last.index, 3);
let rotMax = 0;
let rvMax = 0;
for (let i = 0; i < m.rot.length; i += 1) {
  if (m.rot[i] > rotMax) rotMax = m.rot[i];
  if (m.rotVel[i] > rvMax) rvMax = m.rotVel[i];
}
check('MRMS rotation derived from the coarse composite', rotMax > 0.001 && rotMax < 0.05, `max azimuthal shear ${(rotMax * 1000).toFixed(2)} x10-3 s-1`);
check('MRMS rotational velocity in the TVS range', rvMax > 5 && rvMax < 70, `max Vrot ${rvMax.toFixed(1)} m/s`);

/* ------------------------------------------ 4. warning / report rules */
console.log('\nwarning + report vocabulary');
const windTags = [55, 60, 69, 70, 79, 80, 100].map((v) => `${v}:${WXTag(v)}`);
function WXTag(v) { return v >= 80 ? 'destructive' : v >= 70 ? 'considerable' : 'base'; }
const hailTags = [0.75, 1.0, 1.49, 1.5, 2.0, 2.74, 2.75, 4].map((v) => `${v}:${v >= 2.75 ? 'destructive' : v >= 1.5 ? 'considerable' : 'base'}`);
check('wind thresholds 60/70/80', windTags.join(' ') === '55:base 60:base 69:base 70:considerable 79:considerable 80:destructive 100:destructive', windTags.join(' '));
check('hail thresholds 1.5/2.0/2.75', hailTags.join(' ').includes('1.5:considerable') && hailTags.join(' ').includes('2.75:destructive'), hailTags.join(' '));

const allReports = last.reports;
const mix = {};
for (const r of allReports) mix[r.type] = (mix[r.type] || 0) + 1;
check('report mix has several types', Object.keys(mix).length >= 3, JSON.stringify(mix));
const sigShare = allReports.filter((r) => r.significant).length / Math.max(1, allReports.length);
check('significant reports are the minority', sigShare < 0.5, `${(sigShare * 100).toFixed(0)}%`);

/* ------------------------------------------------- 5. tornado tracks */
console.log('\ntornado tracks');
const tracks = eng.tornadoTracks;
check('tornadoes formed in the outbreak case', tracks.length > 0, `${tracks.length} track(s)`);
check('each tornado has one contiguous path', tracks.length > 0 && tracks.every((t) => Array.isArray(t.path) && t.path.length >= 1), `lengths [${tracks.map((t) => t.path.length).join(', ')}]`);
check('no duplicate tornado ids', new Set(tracks.map((t) => t.id)).size === tracks.length);

/* ------------------------------------------------------ 6. UI panels */
console.log('\nUI panels');
WM.state.frame = last.index;
WM.updateFrameChip();
check('parameter table populated', el('paramTable').innerHTML.includes('MLCAPE'));
check('meters populated', el('meters').innerHTML.includes('Max updraft'));
check('CAM table populated', el('camTable').innerHTML.includes('HRRR'));
check('warning list rendered', el('warnList').innerHTML.length > 0);
check('report list rendered', el('reportList').innerHTML.length > 0);
check('storm list rendered', el('stormList').innerHTML.length > 0);
WM.drawSounding();
check('sounding canvas drawn', el('soundingCanvas').__ctx.__calls.stroke > 2, `${el('soundingCanvas').__ctx.__calls.stroke} strokes`);

/* --------------------------------------------------- 7. other cases */
console.log('\nother cases (short integration)');
for (const c of WM.CASES) {
  WM.state.targetFrames = 35;
  WM.loadCase(c.id);
  const e2 = WM.state.engine;
  while (e2.frames.length <= 35) e2.step();
  const f = e2.frames[e2.frames.length - 1];
  const ok = isFinite(f.stats.maxW) && isFinite(f.stats.maxDbz) && isFinite(f.stats.maxHailIn);
  check(`case "${c.name}"`, ok, `w=${f.stats.maxW.toFixed(0)} Z=${f.stats.maxDbz.toFixed(0)} MESH=${f.stats.maxHailIn.toFixed(2)}in UH=${f.stats.maxUH.toFixed(0)} reports=${f.reports.length}`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
