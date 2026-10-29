/* Visual render test — runs the real Vlexyna pipeline against @napi-rs/canvas
   and writes PNG frames for manual inspection. */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { createCanvas } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
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
window.HTMLCanvasElement.prototype.getContext = function () { return this.getContext('2d'); };

const files = ['util', 'params', 'expr', 'audio', 'fx', 'layers', 'media', 'renderer', 'project', 'templates'];
const bundle = files.map(f => `/*──── ${f}.js ────*/\n` + fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8')).join('\n');
window.eval(bundle);
const VX = window.VX;

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
  add('image', l => { l.y = .46; l.props.size = .3; });
  add('spectrum', l => { l.y = .47; l.props.mode = 'radial'; l.props.count = 120; l.props.radius = .19; l.props.height = .26; l.fx.push({ id: 'glow', enabled: true, params: { radius: 30, color: '#7c5cff', intensity: 1, blend: 'lighter' } }); });
  const lyr = add('lyrics', l => { l.y = .82; l.props.size = 4.2; l.props.lines = [{ t: 0, text: 'THIS IS A LYRICS TEST LINE' }, { t: 5.5, text: 'KARAOKE SWEEP ON BEAT TWO' }]; l.props.style = 'karaoke'; });
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
console.log('done →', OUT);
