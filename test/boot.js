/* Boot test — runs the BUILT Vue app (dist/) in jsdom with stubbed canvas/audio.
   Catches mount-time crashes the compiler can't. Run: npm run build && npm run test:boot */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(ROOT, 'dist/assets');
const jsFile = fs.readdirSync(distDir).find(f => f.startsWith('index-') && f.endsWith('.js'));
if (!jsFile) { console.error('✗ no built bundle in dist/ — run `npm run build` first'); process.exit(1); }
const js = fs.readFileSync(path.join(distDir, jsFile), 'utf8');

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
  url: 'http://localhost:1420/', runScripts: 'outside-only', pretendToBeVisual: true,
});
const { window } = dom;

/* ---- engine stubs (same shape as smoke.js) ---- */
function makeCtx(canvas) {
  const grad = { addColorStop() { } };
  const target = {
    canvas, measureText: () => ({ width: 42 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad, createConicGradient: () => grad, createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    putImageData: () => { },
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    isPointInPath: () => false,
  };
  return new Proxy(target, {
    get(t, k) { if (k in t) return t[k]; if (k === Symbol.toPrimitive) return () => 0; return () => undefined; },
    set(t, k, v) { t[k] = v; return true; }
  });
}
window.HTMLCanvasElement.prototype.getContext = function (type) {
  if (String(type).includes('webgl')) return null; /* shader layer must take its fallback */
  if (!this.__ctx) this.__ctx = makeCtx(this);
  return this.__ctx;
};
window.HTMLCanvasElement.prototype.toBlob = function (cb) { setTimeout(() => cb({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)), size: 8 }), 0); };
window.HTMLCanvasElement.prototype.captureStream = function () { return { getTracks: () => [], getAudioTracks: () => [] }; };
window.URL.createObjectURL = window.URL.createObjectURL || (() => 'blob:x');
window.URL.revokeObjectURL = window.URL.revokeObjectURL || (() => { });
window.ResizeObserver = window.ResizeObserver || class { observe() { } unobserve() { } disconnect() { } };

class FakeParam { constructor(v = 1) { this.value = v; } setValueAtTime() { } linearRampToValueAtTime() { } exponentialRampToValueAtTime() { } }
class FakeNode {
  constructor() { this.gain = new FakeParam(); this.frequency = new FakeParam(440); this.Q = new FakeParam(1); this.threshold = new FakeParam(-24); this.ratio = new FakeParam(1); this.detune = new FakeParam(0); }
  connect() { return this; } disconnect() { } start() { } stop() { }
}
class FakeAnalyser extends FakeNode {
  constructor() { super(); this.fftSize = 2048; this.frequencyBinCount = 1024; this.smoothingTimeConstant = .8; }
  getByteFrequencyData(a) { for (let i = 0; i < a.length; i++) a[i] = (i * 37) % 256; }
  getFloatTimeDomainData(a) { for (let i = 0; i < a.length; i++) a[i] = Math.sin(i / 20) * .5; }
}
class FakeAC {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = new FakeNode(); }
  resume() { return Promise.resolve(); }
  createAnalyser() { return new FakeAnalyser(); }
  createGain() { return new FakeNode(); }
  createMediaStreamAudioDestination() { const n = new FakeNode(); n.stream = { getAudioTracks: () => [] }; return n; }
  createBufferSource() { return new FakeNode(); }
  createDynamicsCompressor() { return new FakeNode(); }
  createConvolver() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createBuffer(ch, len, sr) { return { duration: len / sr, numberOfChannels: ch, sampleRate: sr, getChannelData: () => new Float32Array(len) }; }
  decodeAudioData() { return Promise.resolve({ duration: 10, numberOfChannels: 2, sampleRate: 44100, getChannelData: () => new Float32Array(441000) }); }
}
window.AudioContext = FakeAC;
window.OfflineAudioContext = class extends FakeAC { startRendering() { return Promise.resolve({ duration: 12, numberOfChannels: 2, sampleRate: 44100, getChannelData: () => new Float32Array(441000) }); } };
window.MediaRecorder = class { constructor() { } start() { } stop() { } ondataavailable = null; onstop = null; };
window.MediaRecorder.isTypeSupported = () => true;

const errors = [];
window.addEventListener('error', (e) => errors.push(e.message + (e.error ? ' :: ' + (e.error.stack || '').split('\n').slice(0, 2).join(' | ') : '')));

try { window.eval(js); } catch (e) { console.log('✗ eval bundle:', (e.stack || '').split('\n').slice(0, 4).join(' | ')); process.exit(1); }

await new Promise(r => setTimeout(r, 800));
const app = window.document.querySelector('#app');
const html = app ? app.innerHTML : '';
let pass = true;
const check = (okk, name) => { console.log((okk ? '  ✓ ' : '  ✗ ') + name); if (!okk) pass = false; };

check(!!(app && app.children.length && html.includes('Vlexyna')), 'app mounts with UI shell');
for (const [n, re] of [['top bar', /Vlexyna/], ['layer panel', /Layers/], ['inspector', /Inspector/], ['timeline lanes', /tl-lane/]]) check(re.test(html), n);

const VX = window.VX;
check(!!(VX && VX.app && VX.project?.current), 'engine booted into the app');
check(!!(VX?.project?.current?.layers?.length), 'project has layers (Blank seed)');
if (VX) {
  VX.app.togglePlay(); VX.app.togglePlay();
  VX.project.current.layers.push(VX.layers.make('spectrum'));
  VX.project.snapshot('add spectrum');
  VX.project.undo(); VX.project.redo();
  check(VX.project.current.layers.length > 0, 'play/undo/redo round-trip');
  check(typeof VX.renderer.render === 'function', 'renderer exposed');
}
check(errors.length === 0, 'zero runtime errors');
if (errors.length) errors.slice(0, 8).forEach(e => console.log('     ', e));
console.log(pass ? '\nBOOT TEST PASSED' : '\nBOOT TEST FAILED');
process.exit(pass ? 0 : 1);
