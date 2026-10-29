/* Visual render test — runs the real Vlexyna pipeline against @napi-rs/canvas
   and writes PNG frames for manual inspection. Run: npm run test:render */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createCanvas } from '@napi-rs/canvas';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(OUT, { recursive: true });

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const window = dom.window;

/* real canvases whenever the app creates one */
const origCreate = window.document.createElement.bind(window.document);
window.document.createElement = (tag, ...rest) => {
  if (String(tag).toLowerCase() === 'canvas') {
    const c = createCanvas(300, 150);
    c.style = {};
    c.addEventListener = () => { };
    return c;
  }
  return origCreate(tag, ...rest);
};
window.HTMLCanvasElement.prototype.getContext = function (type) {
  /* no WebGL here — the shader layer must take its Canvas2D fallback */
  if (String(type).includes('webgl')) return null;
  return this.getContext('2d');
};

/* bundle the ESM engine */
const r = buildSync({
  entryPoints: [path.join(ROOT, 'engine/index.js')],
  bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent',
});
window.eval(r.outputFiles[0].text);
const VX = window.VX;

/* minimal app shell */
VX.app = {
  playing: false, time: 0, loop: true, muted: false, micOn: false, exporting: false,
  previewQuality: 720, zoom: 1,
  duration: () => 30,
  pause() { this.playing = false; }, play() { this.playing = true; },
  onFrame: null, onExportProgress: null,
};
VX.ui = {
  refreshAll() { }, refreshInspector() { }, refreshTimeline() { },
  updateFPS() { }, updateTransport() { }, updateUndo() { }, updateSaved() { }, drawOverlay() { },
  openLyricsEditor() { },
};

/* ---- fake live audio state ---- */
const eng = VX.audio.engine;
eng.analyser = { fftSize: 4096 };
eng.ctx = { sampleRate: 44100 };
eng.freq = new Uint8Array(2048);
for (let i = 0; i < eng.freq.length; i++) {
  const f = i / eng.freq.length;
  eng.freq[i] = Math.max(0, Math.min(255, 235 * Math.pow(1 - f, 1.6) + 60 * Math.pow(Math.sin(f * 40), 2) * (1 - f) + 25 * Math.random()));
}
eng.wave = new Float32Array(4096);
for (let i = 0; i < eng.wave.length; i++) eng.wave[i] = Math.sin(i / 30) * .6 * Math.sin(i / 900);
eng.bands = { bass: .78, mid: .5, treble: .32, level: .52 };
eng.beat = 0.85; eng.beatCount = 42;
eng.duration = 30; eng.name = 'demo';

VX.project.init();

const W = 1280, Hh = 720;
const shots = [
  ['trap', 'Trap Nation'], ['neon', 'Neon Wave'], ['synth', 'Synthdrive'],
  ['tunnel', 'Cosmic Tunnel'], ['party', 'Party Pop'], ['lyricfocus', 'Lyric Focus'],
  ['fire', 'Fire Bars'], ['vhs', 'Glitch VHS'], ['led', 'LED Wall'], ['minimal', 'Minimal Studio'],
  ['shaderlab', 'Shader Lab'], ['orbital', 'Orbital'],
];
for (const [slug, name] of shots) {
  const t = VX.templates.list.find(x => x.name === name);
  VX.templates.apply(t);
  const c = createCanvas(W, Hh);
  for (let f = 0; f < 20; f++) VX.renderer.render(c, f * 0.05, { dt: 1 / 60, playing: true }); /* warm up particle/anim state */
  VX.renderer.render(c, 6.2, { dt: 1 / 60, playing: true });
  fs.writeFileSync(path.join(OUT, slug + '.png'), c.toBuffer('image/png'));
  console.log('✓ rendered', name);
}

/* custom: lyrics + progress + heavy fx */
{
  const proj = VX.project.current;
  proj.layers = [];
  const add = (type, fn) => { const l = VX.layers.make(type); fn && fn(l); proj.layers.push(l); return l; };
  add('background', l => { l.props.mode = 'gradient'; l.props.c1 = '#090b16'; l.props.c2 = '#1c1240'; l.props.vign = .5; });
  add('plasma', l => { l.props.style = 'aurora'; l.props.c1 = '#312e81'; l.props.c2 = '#0e7490'; l.props.c3 = '#9333ea'; l.props.mix = .45; });
  add('starfield', l => { l.props.count = 200; l.props.speed = 120; });
  add('particles3d', l => { l.props.count = 260; l.props.c1 = '#22d3ee'; l.props.c2 = '#7c5cff'; });
  add('spherefield', l => { l.props.radius = .3; l.props.c1 = '#f472b6'; });
  add('spectrum', l => { l.y = .47; l.props.mode = 'radial'; l.props.count = 120; l.props.radius = .19; l.props.height = .26; l.fx.push({ id: 'glow', enabled: true, params: { radius: 30, color: '#7c5cff', intensity: 1, blend: 'lighter' } }); });
  add('lyrics', l => { l.y = .82; l.props.size = 4.2; l.props.lines = [{ t: 0, text: 'THIS IS A LYRICS TEST LINE' }, { t: 5.5, text: 'KARAOKE SWEEP ON BEAT TWO' }]; l.props.style = 'karaoke'; });
  add('progress', l => { l.y = .93; });
  add('text', l => { l.y = .12; l.props.text = 'VLEXYNA'; l.props.size = 6; l.props.gradient = true; l.props.anim = 'pulse'; });
  const c = createCanvas(W, Hh);
  for (let f = 0; f < 20; f++) VX.renderer.render(c, f * 0.05, { dt: 1 / 60, playing: true });
  VX.renderer.render(c, 6.0, { dt: 1 / 60, playing: true });
  fs.writeFileSync(path.join(OUT, 'custom.png'), c.toBuffer('image/png'));
  console.log('✓ rendered custom composition');
}

/* portrait 9:16 */
{
  const t = VX.templates.list.find(x => x.name === 'Party Pop');
  VX.templates.apply(t);
  VX.project.current.width = 1080; VX.project.current.height = 1920;
  const c = createCanvas(540, 960);
  for (let f = 0; f < 20; f++) VX.renderer.render(c, f * 0.05, { dt: 1 / 60, playing: true });
  VX.renderer.render(c, 6.2, { dt: 1 / 60, playing: true });
  fs.writeFileSync(path.join(OUT, 'portrait.png'), c.toBuffer('image/png'));
  console.log('✓ rendered portrait');
}

/* global post fx showcase */
{
  const t = VX.templates.list.find(x => x.name === 'Neon Wave');
  VX.templates.apply(t);
  VX.project.current.post = [
    { id: 'channelshift', enabled: true, params: { offsetX: 8, offsetY: 0, mode: 'screen' } },
    { id: 'scanlines', enabled: true, params: { spacing: 5, intensity: .22, color: '#000000', speed: 0 } },
    { id: 'vignette', enabled: true, params: { strength: .5, size: 1, color: '#000000' } },
  ];
  const c = createCanvas(W, Hh);
  for (let f = 0; f < 20; f++) VX.renderer.render(c, f * 0.05, { dt: 1 / 60, playing: true });
  VX.renderer.render(c, 6.2, { dt: 1 / 60, playing: true });
  fs.writeFileSync(path.join(OUT, 'postfx.png'), c.toBuffer('image/png'));
  console.log('✓ rendered post-fx showcase');
}

/* fx2 showcase: a grid of the new v2 effects over a testcard */
{
  const proj = VX.project.current;
  proj.width = 1920; proj.height = 1080;
  proj.layers = [];
  proj.post = [];
  const add = (type, fn) => { const l = VX.layers.make(type); fn && fn(l); proj.layers.push(l); return l; };
  add('background', l => { l.props.mode = 'gradient'; l.props.c1 = '#05070f'; l.props.c2 = '#111827'; });
  add('spectrum', l => { l.y = .5; l.props.count = 64; l.props.height = .5; l.props.c1 = '#e2e8f0'; l.props.c2 = '#22d3ee'; });
  const fxToShow = [
    'kaleidoscope', 'godrays', 'chromakey', 'vhs2', 'liquify', 'bulge',
    'tiltshift', 'outlineadv', 'cas', 'spooky', 'morphfractal', 'trail',
  ];
  const c = createCanvas(W, Hh);
  const tileW = Math.round(W / 4), tileH = Math.round(Hh / 3);
  let n = 0;
  for (const id of fxToShow) {
    const px = (n % 4) * tileW, py = Math.floor(n / 4) * tileH;
    /* render the base once per tile onto a scratch, then apply the fx chain */
    const src = createCanvas(tileW, tileH);
    for (const l of proj.layers) l.x = .5, l.y = .5;
    VX.renderer.render(src, 6.0, { dt: 1 / 60, playing: true });
    const out = VX.fx.apply(src, [{ id, enabled: true, params: VX.fx.defaults(VX.fx.byId[id]) }], { t: 6, W: tileW, H: tileH, dt: 1 / 60, layerLocal: 6 });
    const cx = c.getContext('2d');
    cx.drawImage(out, px, py);
    cx.strokeStyle = 'rgba(255,255,255,.15)';
    cx.strokeRect(px + .5, py + .5, tileW - 1, tileH - 1);
    cx.fillStyle = 'rgba(255,255,255,.8)';
    cx.font = '18px sans-serif';
    cx.fillText(VX.fx.byId[id].name, px + 10, py + 26);
    n++;
  }
  fs.writeFileSync(path.join(OUT, 'fx2-grid.png'), c.toBuffer('image/png'));
  console.log('✓ rendered fx2 grid');
}
/* offline timeline showcase — the exact spectrum the offline exporter sees */
{
  const proj = VX.project.current;
  proj.width = 1280; proj.height = 720;
  proj.layers = [];
  proj.post = [];
  const add = (type, fn) => { const l = VX.layers.make(type); fn && fn(l); proj.layers.push(l); return l; };
  add('background', l => { l.props.mode = 'gradient'; l.props.c1 = '#050810'; l.props.c2 = '#0b1e2d'; });
  add('spectrum', l => { l.y = .72; l.props.count = 96; l.props.height = .5; l.props.c1 = '#22d3ee'; l.props.c2 = '#7c5cff'; l.props.glow = 26; });
  add('wave', l => { l.y = .3; l.props.style = 'mirror'; l.props.c1 = '#e2e8f0'; });
  add('text', l => { l.y = .12; l.props.text = 'OFFLINE TIMELINE'; l.props.size = 4; l.props.c1 = '#e2e8f0'; l.props.anim = 'pulse'; });
  /* synthesize a 4-second buffer and precompute its spectrum the way exportMp4 does */
  const SR = 44100, DUR = 4;
  const data = new Float32Array(SR * DUR);
  for (let i = 0; i < data.length; i++) {
    const t = i / SR;
    data[i] = .2 * Math.sin(2 * Math.PI * 220 * t)
      + .7 * Math.exp(-((t % .8) * 16)) * Math.sin(2 * Math.PI * 55 * (t % .8))
      + .12 * Math.sin(2 * Math.PI * 3520 * t) * (Math.sin(t * 6) > 0 ? 1 : .1);
  }
  const tl = await VX.offline.precompute({ sampleRate: SR, numberOfChannels: 1, duration: DUR, getChannelData: () => data }, 30);
  const c = createCanvas(1280, 720);
  /* frame right after a thump (t = 0.83s) and one mid-gap; warm the bar smoothing first */
  for (const [i, name] of [[25, 'offline-beat'], [37, 'offline-calm']]) {
    VX.offline.apply(eng, tl, i);
    for (let f = 0; f < 10; f++) VX.renderer.render(c, i / 30, { dt: 1 / 30, playing: true });
    fs.writeFileSync(path.join(OUT, name + '.png'), c.toBuffer('image/png'));
  }
  VX.offline.restore(eng);
  console.log('✓ rendered offline-timeline frames (beat + calm)');
}
console.log('done →', OUT);
