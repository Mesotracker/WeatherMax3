/* Headless harness: drives the real app.js render pipeline through a minimal
 * DOM stub so the browser-only code paths actually execute in Node. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function makeCtx() {
  const noop = () => {};
  const calls = { fillText: 0, arc: 0, stroke: 0, fill: 0, putImageData: 0, ellipse: 0 };
  const ctx = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '',
    globalAlpha: 1,
    lineCap: 'butt',
    imageSmoothingEnabled: true,
    setLineDash: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    save: noop,
    restore: noop,
    clearRect: noop,
    fillRect: noop,
    arc: () => { calls.arc += 1; },
    ellipse: () => { calls.ellipse += 1; },
    stroke: () => { calls.stroke += 1; },
    fill: () => { calls.fill += 1; },
    fillText: () => { calls.fillText += 1; },
    createImageData(w, h) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    putImageData: () => { calls.putImageData += 1; },
    __calls: calls,
  };
  return ctx;
}

function makeEl(id) {
  const ctx = makeCtx();
  const el = {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    hidden: false,
    width: 264,
    height: 230,
    offsetWidth: 200,
    offsetHeight: 200,
    dataset: {},
    style: {},
    max: '72',
    _listeners: {},
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    contains() { return false; },
    getContext() { return ctx; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 620 }; },
    click() { (this._listeners.click || []).forEach((f) => f({ target: this })); },
    __ctx: ctx,
  };
  return el;
}

const els = new Map();
const document = {
  readyState: 'complete',
  getElementById(id) {
    if (!els.has(id)) els.set(id, makeEl(id));
    return els.get(id);
  },
  addEventListener() {},
  querySelectorAll() { return []; },
};

const sandbox = {
  console,
  Math,
  JSON,
  Date,
  Number,
  parseInt,
  parseFloat,
  isFinite,
  Infinity,
  NaN,
  Float64Array,
  Float32Array,
  Uint8Array,
  Uint8ClampedArray,
  Uint16Array,
  Int8Array,
  Int32Array,
  Map,
  Set,
  Array,
  Object,
  String,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: () => 0,
  performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
  navigator: { clipboard: { writeText: async () => {} } },
  ImageData: function (w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); },
  document,
  addEventListener() {},
  devicePixelRatio: 1,
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = [
  'wx/base.js',
  'wx/sounding.js',
  'wx/nwp.js',
  'wx/storms.js',
  'wx/radar.js',
  'wx/engine.js',
  'app.js',
];
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}

module.exports = { sandbox, els, makeEl };
