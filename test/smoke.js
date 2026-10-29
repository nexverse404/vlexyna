/* Headless smoke test — bundles the ESM engine with esbuild, boots it in jsdom
   with stubbed canvas/audio, then exercises every layer type, template, effect
   and subsystem. Run: npm test */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- bundle the engine (ESM -> IIFE, registers on window.VX) ---------- */
let bundle;
try {
  const r = buildSync({
    entryPoints: [path.join(ROOT, 'engine/index.js')],
    bundle: true, format: 'iife', platform: 'browser', write: false,
    logLevel: 'silent',
  });
  bundle = r.outputFiles[0].text;
} catch (e) {
  console.error('✗ esbuild failed to bundle engine/index.js\n' + (e.errors?.map(x => x.text).join('\n') || e.stack));
  process.exit(1);
}
console.log(`engine bundled: ${bundle.length.toLocaleString()} chars`);

const dom = new JSDOM('<!doctype html><html><body><canvas id="preview"></canvas></body></html>', {
  url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

let failures = 0, passes = 0;
const ok = (name, fn) => {
  try { fn(); passes++; console.log('  ✓ ' + name); }
  catch (e) { failures++; console.log('  ✗ ' + name + '  →  ' + (e && e.message ? e.message : e)); }
};
const okAsync = async (name, fn) => {
  try { await fn(); passes++; console.log('  ✓ ' + name); }
  catch (e) { failures++; console.log('  ✗ ' + name + '  →  ' + (e && e.message ? e.message : e)); }
};

/* ---------- stubs: canvas 2D, webgl (absent → fallbacks), WebAudio ---------- */
function makeCtx(canvas) {
  const grad = { addColorStop() { } };
  const target = {
    canvas,
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createConicGradient: () => grad,
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    putImageData: () => { },
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    isPointInPath: () => false,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === Symbol.toPrimitive) return () => 0;
      return () => undefined; /* any method = no-op */
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
window.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null; /* forces the shader layer fallback */
  if (!this.__ctx) this.__ctx = makeCtx(this);
  return this.__ctx;
};
window.HTMLCanvasElement.prototype.toBlob = function (cb) { setTimeout(() => cb({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)), size: 8 }), 0); };
window.HTMLCanvasElement.prototype.captureStream = function () { return { getTracks: () => [], getAudioTracks: () => [] }; };
if (!window.URL.createObjectURL) { window.URL.createObjectURL = () => 'blob:x'; window.URL.revokeObjectURL = () => { }; }

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
window.OfflineAudioContext = class extends FakeAC {
  startRendering() { return Promise.resolve({ duration: 12, numberOfChannels: 2, sampleRate: 44100, getChannelData: () => new Float32Array(441000) }); }
};
window.MediaRecorder = class { constructor() { } start() { } stop() { } ondataavailable = null; onstop = null; };
window.MediaRecorder.isTypeSupported = () => true;

const errLog = [];
window.addEventListener('error', e => errLog.push(e.message));

/* ---------- load engine ---------- */
try { window.eval(bundle); } catch (e) { console.log(`  ✗ LOAD engine bundle → ${e.stack.split('\n').slice(0, 4).join(' | ')}`); failures++; }
const VX = window.VX;

/* minimal app shell (normally provided by src/appctl.js) */
VX.app = VX.app || {};
Object.assign(VX.app, {
  playing: false, time: 0, loop: true, muted: false, micOn: false, exporting: false,
  previewQuality: 720, zoom: 1,
  duration: () => (VX.audio.engine && VX.audio.engine.duration) || 30,
  pause() { this.playing = false; }, play() { this.playing = true; },
  onFrame: null, onExportProgress: null,
});
VX.ui = { /* no-op UI hooks (normally routed into the Vue store by src/appctl.js) */
  refreshAll() { }, refreshInspector() { }, refreshTimeline() { },
  updateFPS() { }, updateTransport() { }, updateUndo() { }, updateSaved() { }, drawOverlay() { },
  openLyricsEditor() { },
};

VX.project.init();

const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
const warns = [];
const origWarn = console.warn;
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
const noWarns = () => { if (warns.length) { const w = warns.splice(0); throw new Error(w.slice(0, 2).join(' | ')); } };

(async () => {
  await new Promise(r => setTimeout(r, 60));
  ok('VX global + all engine modules present', () => {
    for (const m of ['util', 'P', 'expr', 'audio', 'fx', 'layers', 'renderer', 'project', 'templates', 'exporter']) if (!VX[m]) throw new Error('missing ' + m);
  });
  ok('boot created a project', () => { if (!VX.project.current) throw new Error('no project'); });
  ok('blank-start template seeds a layer (as appctl.boot does)', () => {
    if (!VX.project.current.layers.length) {
      const blank = VX.templates.list.find(t => t.name === 'Blank');
      VX.project.current.layers = blank.layers.map(l => VX.layers.make(l.type)).filter(Boolean);
    }
    if (!VX.project.current.layers.length) throw new Error('no layers');
  });
  ok('no boot-time window errors', () => { if (errLog.length) throw new Error(errLog.join(' ; ')); });

  console.log('\n── registries ──');
  ok('20 layer types registered', () => { if (VX.layers.list.length !== 20) throw new Error('got ' + VX.layers.list.length); });
  ok('64 effects registered', () => { if (VX.fx.list.length !== 64) throw new Error('got ' + VX.fx.list.length); });
  ok('18 templates registered', () => { if (VX.templates.list.length !== 18) throw new Error('got ' + VX.templates.list.length); });
  ok('every fx def has id/name/cat/params', () => {
    for (const d of VX.fx.list) {
      if (!d.id || !d.name || !d.cat || !Array.isArray(d.params) || typeof d.apply !== 'function') throw new Error(d.id || 'unnamed');
      VX.fx.defaults(d); /* must produce a full default set */
    }
  });
  ok('every layer def has id/name/cat/defaults/params/draw', () => {
    for (const d of VX.layers.list) {
      if (!d.id || !d.name || !d.cat || typeof d.defaults !== 'function' || typeof d.draw !== 'function') throw new Error(d.id || 'unnamed');
      d.defaults();
    }
  });

  console.log('\n── render: every layer type, idle and driven by fake audio ──');
  ok('render idle frame', () => { VX.renderer.render(cv, 1.5, { dt: 1 / 60, playing: false }); noWarns(); });
  ok('fake audio data drives engine', () => {
    const eng = VX.audio.engine;
    eng.ensureCtx(); eng.freq = new Uint8Array(eng.analyser.frequencyBinCount).fill(140);
    eng.wave = new Float32Array(2048);
    eng.playing = true;
    for (let i = 0; i < 10; i++) eng.tick(1 / 60);
    if (eng.bands.bass <= 0) throw new Error('bass=' + eng.bands.bass);
    eng.beat = 1;
  });
  for (const def of VX.layers.list) {
    ok(`layer draw: ${def.name} (${def.id})`, () => {
      const proj = VX.project.current;
      const l = VX.layers.make(def.id);
      proj.layers.push(l);
      if (def.id === 'progress') l.props.style = 'dots';
      if (def.id === 'spectrum') l.props.mode = 'radial';
      if (def.id === 'wave') l.props.style = 'circle';
      for (let f = 0; f < 12; f++) VX.renderer.render(cv, f / 10, { dt: 1 / 60, playing: true });
      proj.layers.pop();
      noWarns();
    });
  }
  ok('shader layer survives without WebGL (fallback path)', () => {
    const proj = VX.project.current;
    const l = VX.layers.make('shader');
    proj.layers.push(l);
    for (let f = 0; f < 4; f++) VX.renderer.render(cv, f / 5, { dt: 1 / 60, playing: true });
    proj.layers.pop();
    noWarns();
  });

  console.log('\n── templates ──');
  for (const t of VX.templates.list) {
    ok(`template applies & renders: ${t.name}`, () => {
      VX.templates.apply(t);
      for (let f = 0; f < 8; f++) VX.renderer.render(cv, f / 10, { dt: 1 / 60, playing: true });
      noWarns();
    });
  }

  console.log('\n── effects: every fx, solo + chained ──');
  for (const def of VX.fx.list) {
    ok(`fx applies: ${def.name} (${def.id})`, () => {
      const src = document.createElement('canvas'); src.width = 64; src.height = 64;
      const out = VX.fx.apply(src, [{ id: def.id, enabled: true, params: VX.fx.defaults(def) }], { t: 1, W: 64, H: 64, dt: 1 / 60, layerLocal: 1 });
      if (!out) throw new Error('no output');
    });
  }
  ok('fx chain alternation (no self-draw)', () => {
    const src = document.createElement('canvas'); src.width = 32; src.height = 32;
    const chain = ['blur', 'glow', 'boxblur', 'grain'].map(id => ({ id, enabled: true, params: VX.fx.defaults(VX.fx.byId[id]) }));
    VX.fx.apply(src, chain, { t: 0 });
  });
  ok('renderlayer gets a frameBefore snapshot from the renderer', () => {
    const proj = VX.project.current;
    const l = VX.layers.make('shape');
    l.fx.push({ id: 'renderlayer', enabled: true, params: VX.fx.defaults(VX.fx.byId.renderlayer) });
    proj.layers.push(l);
    for (let f = 0; f < 4; f++) VX.renderer.render(cv, f / 5, { dt: 1 / 60, playing: true });
    proj.layers.pop();
    noWarns();
  });
  ok('temporal fx keep per-instance state via fx instance arg', () => {
    const l = VX.layers.make('shape');
    const f1 = VX.fx.make('timestop');
    const st = { t: 1, W: 64, H: 64, dt: 1 / 60, layerLocal: 1 };
    const src = document.createElement('canvas'); src.width = 32; src.height = 32;
    VX.fx.apply(src, [f1], st);
    VX.fx.apply(src, [f1], { ...st, t: 2 });
    if (!f1._ts) throw new Error('no state kept');
  });

  console.log('\n── expressions ──');
  ok('expr: arithmetic + fns + vars', () => {
    const f = VX.expr.compile('sin(t*2)*40 + bass*90 + clamp(v1,0,10) + min(3,4)');
    const v = f({ t: 1, bass: .5, v1: 100 });
    if (Math.abs(v - (Math.sin(2) * 40 + 45 + 10 + 3)) > 1e-6) throw new Error('bad value ' + v);
  });
  ok('expr: ternary + comparison', () => {
    const v = VX.expr.compile('bass > 0.3 ? 10 : 20')({ bass: .5 });
    if (v !== 10) throw new Error('ternary ' + v);
  });
  ok('expr: freq()/fft() against fake spectrum', () => {
    const f = VX.expr.compile('fft(80, 200) + freq(0)');
    const v = f({ t: 0, bass: 0, mid: 0, treble: 0, level: 0, beat: 0, pi: Math.PI, e: Math.E, v1: 0, v2: 0, v3: 0, v4: 0 });
    if (!isFinite(v)) throw new Error('non-finite ' + v);
  });
  ok('string automations compute (v2 model)', () => {
    const env = VX.renderer.envFor(2, 0, { bass: .5, mid: 0, treble: 0, level: .5, beat: 1 }, {});
    const l = { auto: { scale: 'beat*0.3 + bass', opacity: 'sin(t*2)*.2' } };
    const d = VX.renderer.autoDelta(l, 'scale', env);
    if (Math.abs(d - 0.8) > 1e-9) throw new Error('scale delta ' + d);
    if (Math.abs(VX.renderer.autoDelta(l, 'opacity', env) - Math.sin(4) * .2) > 1e-9) throw new Error('opacity delta');
    if (VX.renderer.autoDelta({ auto: { scale: '' } }, 'scale', env) !== 0) throw new Error('empty string should be 0');
  });
  ok('expr: bad input reports cleanly', () => {
    if (!VX.expr.check('sin(')) throw new Error('should report error');
    if (VX.expr.check('sin(t)') !== null) throw new Error('should pass');
  });

  console.log('\n── automation plumbing ──');
  ok('reactivity delta applies to transform + props', () => {
    const proj = VX.project.current;
    const l = VX.layers.make('spectrum');
    l.auto = { scale: 'bass*.5', height: '.3 + bass*.4' };
    proj.layers.push(l);
    VX.renderer.render(cv, 0, { dt: 1 / 60, playing: true });
    proj.layers.pop();
  });

  console.log('\n── lyrics ──');
  ok('LRC parsing', () => {
    const l = VX.layers.parseLRC('[00:01.50] hello\n[01:02]world\nplain line');
    if (l.length !== 3 || Math.abs(l[0].t - 1.5) > 1e-6 || l[1].t !== 62) throw new Error(JSON.stringify(l));
  });
  ok('TTML parsing', () => {
    const l = VX.layers.parseTTML('<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="00:00:05.000">hey</p><p begin="00:00:09.500">you</p></div></body></tt>');
    if (l.length !== 2 || l[0].t !== 5 || Math.abs(l[1].t - 9.5) > 1e-6) throw new Error(JSON.stringify(l));
  });
  ok('lyrics layer renders with lines', () => {
    const proj = VX.project.current;
    const l = VX.layers.make('lyrics');
    l.props.lines = [{ t: 0, text: 'first' }, { t: 2, text: 'second' }];
    proj.layers.push(l);
    VX.renderer.render(cv, 2.5, { dt: 1 / 60, playing: true });
    VX.renderer.render(cv, 0.1, { dt: 1 / 60, playing: true });
    proj.layers.pop();
  });

  console.log('\n── undo / redo / persistence ──');
  ok('undo & redo', () => {
    const p = VX.project;
    p.snapshot('t1'); p.current.layers.push(VX.layers.make('shape')); p.snapshot('t2');
    const n2 = p.current.layers.length;
    p.undo(); if (p.current.layers.length !== n2 - 1) throw new Error('undo failed');
    p.redo(); if (p.current.layers.length !== n2) throw new Error('redo failed');
  });
  ok('project save/load cycle', () => {
    VX.project.current.name = 'Smoke Test';
    VX.project.saveNow();
    const list = VX.project.list();
    if (!list.some(r => r.name === 'Smoke Test')) throw new Error('not saved');
  });

  console.log('\n── audio engine ──');
  await okAsync('demo track synthesis path', async () => {
    await VX.audio.engine.loadDemo();
    if (VX.audio.engine.duration <= 0) throw new Error('no duration');
  });
  ok('play/pause/seek state machine', () => {
    const app = VX.app, eng = VX.audio.engine;
    app.play(); if (!app.playing) throw new Error('not playing');
    app.pause(); if (app.playing) throw new Error('still playing');
    eng.seek ? eng.seek(2.5) : 0;
  });
  ok('peaks computed', () => { if (!VX.audio.engine.peaks || !VX.audio.engine.peaks.length) throw new Error('no peaks'); });

  console.log('\n── exporter ──');
  ok('snapshotPNG path', () => { VX.exporter.snapshotPNG(); });
  ok('bestMime picks a format', () => { if (!VX.exporter.bestMime()) throw new Error('none'); });

  console.log('\n── environment / vars ──');
  ok('project vars flow into env', () => {
    VX.project.current.vars.v1 = 5;
    const env = VX.renderer.envFor(2, 0, { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 }, VX.project.current.vars);
    if (env.v1 !== 5) throw new Error('v1 missing');
  });

  console.log('\n── final: no window errors during whole run ──');
  ok('window error log empty', () => { if (errLog.length) throw new Error(errLog.slice(0, 5).join(' ; ')); });
  console.warn = origWarn;

  console.log(`\n═══════ SMOKE RESULT: ${passes} passed, ${failures} failed ═══════`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
