/* Headless smoke test — boots Vlexyna in jsdom with stubbed canvas/audio,
   then exercises every layer type, template, effect, UI panel and subsystem. */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

let failures = 0, passes = 0;
const ok = (name, fn) => {
  try { fn(); passes++; console.log('  ✓ ' + name); }
  catch (e) { failures++; console.log('  ✗ ' + name + '  →  ' + (e && e.stack ? e.stack.split('\n')[0] + ' @ ' + (e.stack.split('\n')[1] || '').trim() : e)); }
};
const okAsync = async (name, fn) => {
  try { await fn(); passes++; console.log('  ✓ ' + name); }
  catch (e) { failures++; console.log('  ✗ ' + name + '  →  ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
};

/* ---------- stubs ---------- */
function makeCtx(canvas) {
  const grad = { addColorStop() { } };
  const target = {
    canvas,
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
    isPointInPath: () => false,
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
window.HTMLCanvasElement.prototype.getContext = function () { if (!this.__ctx) this.__ctx = makeCtx(this); return this.__ctx; };
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

/* capture errors */
const errLog = [];
window.addEventListener('error', e => errLog.push(e.message));

/* ---------- load scripts (concatenated = shared lexical scope, like <script> tags) ---------- */
const files = ['util', 'params', 'expr', 'audio', 'fx', 'layers', 'media', 'renderer', 'project', 'templates', 'exporter', 'ui', 'main'];
const bundle = files.map(f => `/*──── ${f}.js ────*/\n` + fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8')).join('\n');
try { window.eval(bundle); } catch (e) { console.log(`  ✗ LOAD bundle → ${e.stack.split('\n').slice(0, 4).join(' | ')}`); failures++; }
console.log('\n── scripts loaded, boot state ──');

const VX = window.VX;

(async () => {
  /* ---------- wait for boot (jsdom defers DOMContentLoaded) ---------- */
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  await new Promise(r => setTimeout(r, 80));
ok('VX global + modules present', () => {
  for (const m of ['util', 'expr', 'audio', 'fx', 'layers', 'renderer', 'project', 'templates', 'exporter', 'ui', 'app']) if (!VX[m]) throw new Error('missing ' + m);
});
ok('boot created a project', () => { if (!VX.project.current || !VX.project.current.layers.length) throw new Error('no layers'); });
ok('UI initialized (ready flag)', () => { if (!VX.ui.ready) throw new Error('ui not ready'); });
ok('no boot-time window errors', () => { if (errLog.length) throw new Error(errLog.join(' ; ')); });

console.log('\n── layer registry ──');
ok('17 layer types registered', () => { if (VX.layers.list.length !== 17) throw new Error('got ' + VX.layers.list.length); });

console.log('\n── render: every layer type, both idle and driven by fake audio ──');
const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
/* capture layer warnings — a warn = a real bug */
const warns = [];
const origWarn = console.warn;
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
const noWarns = (label) => { if (warns.length) { const w = warns.splice(0); throw new Error(w.slice(0, 2).join(' | ')); } };
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
    /* exercise non-default styles too */
    if (def.id === 'progress') l.props.style = 'dots';
    if (def.id === 'spectrum') { l.props.mode = 'radial'; }
    if (def.id === 'wave') l.props.style = 'circle';
    for (let f = 0; f < 12; f++) VX.renderer.render(cv, f / 10, { dt: 1 / 60, playing: true });
    proj.layers.pop();
    noWarns();
  });
}

console.log('\n── templates ──');
ok('16 templates registered', () => { if (VX.templates.list.length !== 16) throw new Error('got ' + VX.templates.list.length); });
for (const t of VX.templates.list) {
  ok(`template applies & renders: ${t.name}`, () => {
    VX.templates.apply(t);
    for (let f = 0; f < 8; f++) VX.renderer.render(cv, f / 10, { dt: 1 / 60, playing: true });
    noWarns();
  });
}

console.log('\n── effects ──');
ok('16 effects registered', () => { if (VX.fx.list.length !== 16) throw new Error('got ' + VX.fx.list.length); });
for (const def of VX.fx.list) {
  ok(`fx applies: ${def.name}`, () => {
    const src = document.createElement('canvas'); src.width = 64; src.height = 64;
    const out = VX.fx.apply(src, [{ id: def.id, enabled: true, params: VX.fx.defaults(def) }], { t: 1 });
    if (!out) throw new Error('no output');
  });
}
ok('fx chain alternation (no self-draw)', () => {
  const src = document.createElement('canvas'); src.width = 32; src.height = 32;
  const chain = ['blur', 'glow', 'boxblur', 'grain'].map(id => ({ id, enabled: true, params: VX.fx.defaults(VX.fx.byId[id]) }));
  VX.fx.apply(src, chain, { t: 0 });
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
ok('expr: bad input throws cleanly', () => {
  if (!VX.expr.check('sin(') ) throw new Error('should report error');
  if (VX.expr.check('sin(t)') !== null) throw new Error('should pass');
});

console.log('\n── automation plumbing ──');
ok('reactivity delta applies to transform + props', () => {
  const proj = VX.project.current;
  const l = VX.layers.make('spectrum');
  l.auto = { scale: { src: 'bass', amt: .5 }, height: { src: 'expr', expr: '.3 + bass*.4' } };
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
  p.snapshot('t1'); VX.project.current.layers.push(VX.layers.make('shape')); p.snapshot('t2');
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

console.log('\n── UI panels ──');
ok('inspector renders for every layer (all 3 tabs)', () => {
  const proj = VX.project.current;
  for (const def of VX.layers.list) {
    const l = VX.layers.make(def.id); proj.layers.push(l);
    VX.ui.select(l.id);
    for (const tab of ['props', 'auto', 'fx']) { VX.ui.setTab(tab); }
    proj.layers.pop();
  }
  VX.ui.select(null);
  VX.ui.setTab('props'); VX.ui.setTab('fx');
});
ok('add fx to layer via model + inspector renders', () => {
  const proj = VX.project.current;
  const l = VX.layers.make('spectrum'); proj.layers.push(l);
  VX.ui.select(l.id); VX.ui.setTab('fx');
  l.fx.push(VX.fx.make('glow'), VX.fx.make('gradmap'));
  VX.ui.refreshInspector();
  proj.layers.pop(); VX.ui.select(null);
});
ok('modals open & close', () => {
  for (const op of ['openTemplates', 'openProjects', 'openExport', 'openHelp', 'openWelcome']) {
    VX.ui[op](); VX.ui.closeModal(true);
  }
});
ok('lyrics editor opens', () => {
  const proj = VX.project.current;
  const l = VX.layers.make('lyrics'); proj.layers.push(l);
  VX.ui.openLyricsEditor(l); VX.ui.closeModal(true);
  proj.layers.pop();
});
ok('timeline refresh + ruler', () => { VX.ui.refreshTimeline(); });
ok('transport updates', () => { VX.ui.updateTransport(); });
ok('layer ops: duplicate/move/delete', () => {
  const proj = VX.project.current;
  const l = VX.layers.make('shape'); proj.layers.push(l);
  VX.ui.select(l.id);
  VX.ui.duplicateLayer(l.id);
  VX.ui.moveLayer(l.id, 1); VX.ui.moveLayer(l.id, -1);
  VX.ui.deleteLayer(l.id);
  VX.ui.deleteLayer(proj.layers[proj.layers.length - 1].id);
});
ok('canvas size change', () => { VX.ui.setSize(1080, 1920); VX.ui.setSize(1920, 1080); });

console.log('\n── audio engine ──');
await okAsync('demo track synthesis path', async () => {
  await VX.audio.engine.loadDemo();
  if (VX.audio.engine.duration <= 0) throw new Error('no duration');
  VX.ui.refreshTimeline();
});
ok('play/pause/seek state machine', () => {
  const app = VX.app, eng = VX.audio.engine;
  app.play(); if (!app.playing) throw new Error('not playing');
  app.pause(); if (app.playing) throw new Error('still playing');
  app.seekTo(2.5); if (Math.abs(app.time - 2.5) > 1e-6) throw new Error('seek failed');
});
ok('peaks computed', () => { if (!VX.audio.engine.peaks || !VX.audio.engine.peaks.length) throw new Error('no peaks'); });

console.log('\n── exporter ──');
ok('snapshotPNG path', () => { VX.exporter.snapshotPNG(); });
ok('bestMime picks a format', () => { if (!VX.exporter.bestMime()) throw new Error('none'); });

console.log('\n── expression-driven global vars ──');
ok('project vars flow into env', () => {
  VX.project.current.vars.v1 = 5;
  const env = VX.renderer.envFor(2, 0, { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 }, VX.project.current.vars);
  if (env.v1 !== 5) throw new Error('v1 missing');
});

console.log('\n── final: no window errors during whole run ──');
ok('window error log empty', () => { if (errLog.length) throw new Error(errLog.slice(0, 5).join(' ; ')); });

console.log(`\n═══════ SMOKE RESULT: ${passes} passed, ${failures} failed ═══════`);
process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
