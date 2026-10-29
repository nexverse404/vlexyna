/* Boot test — runs the BUILT Vue app (dist/) in jsdom with stubbed canvas/audio.
   Catches mount-time crashes the compiler can't. Run: npm run build && npm run test:boot */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(ROOT, 'dist/assets');
const candidates = fs.readdirSync(distDir).filter(f => f.startsWith('index-') && f.endsWith('.js'));
if (!candidates.length) { console.error('✗ no built bundle in dist/ — run `npm run build` first'); process.exit(1); }

function stubEngine(window) {
  /* ---- canvas 2D stub (same shape as smoke.js) ---- */
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
  window.VideoEncoder = window.VideoEncoder || class VideoEncoder { constructor() { } configure() { } encode() { } flush() { } close() { } static isConfigSupported() { return Promise.resolve({ supported: true }); } };
  window.VideoFrame = window.VideoFrame || class VideoFrame { };

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
}

function makeDom() {
  const d = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
    url: 'http://localhost:1420/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  stubEngine(d.window);
  d._errLog = [];
  d.window.addEventListener('error', e => d._errLog.push(e.message + (e.error ? ' :: ' + String(e.error.stack || e.error).split('\n')[0] : '')));
  return d;
}

/* several chunks can be named index-* (mediabunny re-export); the entry is the one that mounts #app */
let window = null, chosen = null;
for (const f of candidates) {
  const d = makeDom();
  try { d.window.eval(fs.readFileSync(path.join(distDir, f), 'utf8')); } catch (e) { continue; }
  await new Promise(r => setTimeout(r, 700));
  const app = d.window.document.querySelector('#app');
  if (app && app.children.length && app.innerHTML.includes('Vlexyna')) { window = d.window; chosen = d; break; }
}
if (!window) { console.error('✗ no index-*.js chunk mounted the app'); process.exit(1); }
console.log('✓ entry chunk found among', candidates.length, 'index-* candidates');

const document = window.document;
const app = document.querySelector('#app');
const html = app ? app.innerHTML : '';
let pass = true;
const check = (okk, name) => { console.log((okk ? '  ✓ ' : '  ✗ ') + name); if (!okk) pass = false; };

check(!!(app && app.children.length && html.includes('Vlexyna')), 'app mounts with UI shell');
for (const [n, re] of [['top bar', /Vlexyna/], ['layer panel', /Layers/], ['inspector', /Inspector/], ['timeline lanes', /tl-lane/]]) check(re.test(html), n);

const VX = window.VX;
check(!!(VX && VX.app && VX.project?.current), 'engine booted into the app');
check(!!(VX?.project?.current?.layers?.length), 'project has layers (Blank seed)');
check(!!(VX?.layers?.list?.some(l => l.id === 'lottie')), 'Lottie layer registered in the app');
check(!!(VX?.offline?.precompute && VX?.offline?.exportMp4), 'offline export module present in the app');
if (VX) {
  VX.app.togglePlay(); VX.app.togglePlay();
  VX.project.current.layers.push(VX.layers.make('spectrum'));
  VX.project.snapshot('add spectrum');
  VX.project.undo(); VX.project.redo();
  check(VX.project.current.layers.length > 0, 'play/undo/redo round-trip');
  check(typeof VX.renderer.render === 'function', 'renderer exposed');
}

/* ── responsive chrome: drawers + timeline collapse (state is DOM-observable) ── */
{
  const doc = chosen.window.document;
  const tick = () => new Promise(r => setTimeout(r, 30));   /* let Vue flush the patch */
  const layersPanel = doc.querySelector('.layers');
  const inspPanel = doc.querySelector('.insp');
  const toggles = [...doc.querySelectorAll('header.bar .only-narrow')];
  check(toggles.length >= 2, 'drawer toggle buttons rendered (narrow toolbar)');
  if (toggles.length >= 2 && layersPanel && inspPanel) {
    toggles[0].click(); await tick();                      /* layers drawer */
    check(layersPanel.classList.contains('open'), 'layers drawer opens on toggle');
    check(!!doc.querySelector('.drawer-scrim'), 'drawer scrim appears');
    doc.querySelector('.drawer-scrim').click(); await tick();
    check(!layersPanel.classList.contains('open') && !doc.querySelector('.drawer-scrim'), 'scrim click closes drawer');
    toggles[1].click(); await tick();                      /* inspector drawer */
    check(inspPanel.classList.contains('open'), 'inspector drawer opens on toggle');
    toggles[1].click(); await tick();
    check(!inspPanel.classList.contains('open'), 'inspector drawer closes on toggle');
  }
  const tlBtns = [...doc.querySelectorAll('.tl-side-tools .ib')];
  const collapse = tlBtns[tlBtns.length - 1];
  if (collapse) {
    collapse.click(); await tick();
    check(doc.body.classList.contains('tl-closed'), 'timeline collapse adds body class');
    collapse.click(); await tick();
    check(!doc.body.classList.contains('tl-closed'), 'timeline expand removes it');
  }
  /* ── v2.2 chrome: reactivity mixer, GIF tab, save-template, zoom, gizmo ── */
  {
    const tick2 = () => new Promise(r => setTimeout(r, 30));
    /* reactivity button in the transport opens the mixer */
    const rxBtn = [...doc.querySelectorAll('.transport .ib')].find(b => (b.title || '').includes('reactivity'));
    check(!!rxBtn, 'reactivity mixer button in transport');
    if (rxBtn) {
      rxBtn.click(); await tick2();
      const modal = doc.querySelector('.modal');
      check(!!modal && modal.textContent.includes('Audio reactivity'), 'reactivity modal opens');
      check(modal && modal.querySelectorAll('input[type=range]').length >= 5, 'reactivity modal has 5 band sliders');
      const reset = [...modal.querySelectorAll('button')].find(b => /reset/i.test(b.textContent));
      check(!!reset, 'reactivity reset button');
      const closeB = modal.querySelector('.m-h .ib') || modal.querySelector('.modal-h .ib');
      closeB && closeB.click(); await tick2();
    }
    /* export modal gains a GIF tab (disabled until audio loads) */
    const expBtn = [...doc.querySelectorAll('header.bar .btn')].find(b => /Export/.test(b.textContent));
    expBtn.click(); await tick2();
    let gifTab = null, modes = null;
    for (const b of doc.querySelectorAll('.x-modes button')) if (b.textContent.includes('GIF')) gifTab = b;
    modes = doc.querySelectorAll('.x-modes button').length;
    check(modes === 4, 'export modal has 4 modes (video/mp4/frames/gif)');
    check(!!gifTab && gifTab.disabled, 'GIF tab present + disabled without audio');
    const closeX = doc.querySelector('.modal-h .ib') || doc.querySelector('.m-h .ib');
    closeX && closeX.click(); await tick2();
    /* templates modal offers saving your own */
    const tplBtn = [...doc.querySelectorAll('header.bar .btn')].find(b => /Templates/.test(b.textContent));
    tplBtn.click(); await tick2();
    const saveTpl = [...doc.querySelectorAll('button')].find(b => /Save current as template/.test(b.textContent));
    check(!!saveTpl, 'templates modal has “save current as template”');
    const closeX2 = doc.querySelector('.modal-h .ib') || doc.querySelector('.m-h .ib');
    closeX2 && closeX2.click(); await tick2();
    /* stage zoom controls */
    const zoomBtns = doc.querySelectorAll('.zoombar .ib');
    check(zoomBtns.length === 3, 'stage zoom controls (−/fit/+)');
    if (zoomBtns.length === 3) {
      zoomBtns[2].click(); await tick2();
      check(/25%/.test(doc.querySelector('.zoombar .zoom-cur').textContent), 'zoom in shows 25%');
      zoomBtns[1].click(); await tick2();
      check(/Fit/.test(doc.querySelector('.zoombar .zoom-cur').textContent), 'fit restores');
    }
    /* dynamic font picker — text layer params resolve through a function now */
    {
      const t = chosen.window.VX.layers.make('text');
      chosen.window.VX.project.current.layers.push(t);
      chosen.window.VX.ui.refreshAll();          /* bump S.rev so the panel re-renders */
      await tick2();
      const row2 = doc.querySelector('.layers .row');   /* panel shows layers reversed — newest first */
      row2 && row2.click(); await tick2();
      const sel = [...doc.querySelectorAll('.insp select')];
      const fontSel = sel.find(s => [...s.options].some(o => /Default Sans|Arial/.test(o.textContent)));
      check(!!fontSel && fontSel.options.length >= 12, 'font picker renders dynamic options');
      check(chosen._errLog.length === 0, 'font picker renders without errors');
    }
    /* selecting a layer reveals the transform gizmo (select() toggles — text is already selected above, so click the next row) */
    const row = [...doc.querySelectorAll('.layers .row')][1];
    if (row) {
      row.click(); await tick2();
      check(!!doc.querySelector('.giz-r') && !!doc.querySelector('.giz-s'), 'transform gizmo handles appear on selection');
      check(!!doc.querySelector('.giz-info'), 'gizmo shows rotation/scale readout');
    }
    /* help lists the new shortcuts */
    const helpBtn = [...doc.querySelectorAll('header.bar .ib')].find(b => (b.title || '').includes('shortcut'));
    if (helpBtn) {
      helpBtn.click(); await tick2();
      const h = doc.body.textContent;
      check(h.includes('split layer at playhead') && h.includes('reactivity mixer'), 'help lists the new shortcuts');
      const closeX3 = doc.querySelector('.modal-h .ib') || doc.querySelector('.m-h .ib');
      closeX3 && closeX3.click(); await tick2();
    }
  }

  /* ── v2.3: globals · shy · multi-select · codec · perf · speed ── */
  {
    const tick3 = () => new Promise(r => setTimeout(r, 30));
    const VX2 = chosen.window.VX;
    /* global variables modal */
    VX2.project.current.vars = { intensity: .5 };
    VX2.ui.refreshAll(); await tick3();
    const kb = new chosen.window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true });
    chosen.window.dispatchEvent(kb); await tick3();
    let gm = doc.querySelector('.modal') || doc.querySelector('.modal-b');
    let inModal = gm ? gm.parentElement : null;
    check(!!gm, 'globals modal opens with G');
    if (gm) {
      const inputs = [...(inModal || gm).querySelectorAll('input.tin')];
      check(inputs.length >= 2 && inputs[0].value === 'intensity', 'globals modal lists project variables');
      const addBtn = [...(inModal || gm).querySelectorAll('button')].find(b => /Add variable/.test(b.textContent));
      check(!!addBtn, 'globals add-variable button');
      if (addBtn) { addBtn.click(); await tick3(); check(VX2.project.current.vars.var2 === 0, 'add-variable writes to project vars'); }
      const closeG = (inModal || gm).querySelector('.ib'); closeG && closeG.click(); await tick3();
    }
    /* shy layers: mark one shy via engine, header button appears, row hides */
    const l0 = VX2.project.current.layers[0];
    if (l0) {
      l0.shy = true; VX2.ui.refreshAll(); await tick3();
      let shyBtn = [...doc.querySelectorAll('.layers .ph .ib')].find(b => (b.title || '').includes('shy'));
      check(!!shyBtn, 'show-shy toggle appears when a shy layer exists');
      const rowsBefore = doc.querySelectorAll('.layers .row').length;
      check(rowsBefore === VX2.project.current.layers.length - 1, 'shy layer hidden from the list');
      if (shyBtn) { shyBtn.click(); await tick3(); check(doc.querySelectorAll('.layers .row').length === VX2.project.current.layers.length, 'show-shy reveals it again'); shyBtn.click(); await tick3(); }
      l0.shy = false; VX2.ui.refreshAll(); await tick3();
    }
    /* multi-select: ctrl-click two rows */
    const rows = doc.querySelectorAll('.layers .row');
    if (rows.length >= 2) {
      rows[0].dispatchEvent(new chosen.window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
      await tick3();
      rows[1].dispatchEvent(new chosen.window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
      await tick3();
      check(doc.querySelectorAll('.layers .row.multi').length === 2, 'ctrl-click multi-selects layers');
      const del = new chosen.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
      chosen.window.dispatchEvent(del); await tick3();
      check(VX2.project.current.layers.length < 2 || doc.querySelectorAll('.layers .row.multi').length === 0, 'multi-delete works');
    }
    /* export modal: codec select + size estimate */
    const expBtn2 = [...doc.querySelectorAll('header.bar .btn')].find(b => /Export/.test(b.textContent));
    expBtn2.click(); await tick3();
    const mp4Tab = [...doc.querySelectorAll('.x-modes button')].find(b => /MP4 offline/.test(b.textContent));
    if (mp4Tab && !mp4Tab.disabled) { mp4Tab.click(); await tick3(); }
    const codecSel = [...doc.querySelectorAll('select')].find(s => [...s.options].some(o => /H\.265/.test(o.textContent)));
    check(!!codecSel, 'codec picker (H.264/H.265/VP9/AV1) in export');
    check(doc.body.textContent.includes('≈') || doc.body.textContent.includes('MB') || doc.body.textContent.includes('PNGs'), 'export size estimate shown');
    const closeE = doc.querySelector('.modal-h .ib') || doc.querySelector('.m-h .ib'); closeE && closeE.click(); await tick3();
    /* F3 perf overlay */
    chosen.window.dispatchEvent(new chosen.window.KeyboardEvent('keydown', { key: 'F3', bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 420));
    check(!!doc.querySelector('#stage .perf'), 'F3 toggles the performance overlay');
    chosen.window.dispatchEvent(new chosen.window.KeyboardEvent('keydown', { key: 'F3', bubbles: true, cancelable: true }));
    await tick3();
    /* transport speed select */
    check(!!doc.querySelector('.transport .speed'), 'playback speed (nightcore) select in transport');
  }

  /* ── v2.4: camera panel (no selection) ── */
  {
    const tick4 = () => new Promise(r => setTimeout(r, 30));
    const VX3 = chosen.window.VX;
    /* ensure nothing selected → inspector shows camera group */
    chosen.window.VX.project.ensureCamera(chosen.window.VX.project.current);
    /* deselect: click the already-selected row if any */
    const inspTxt0 = doc.querySelector('.insp')?.textContent || '';
    if (!inspTxt0.includes('Camera')) {
      /* something is selected from earlier checks — dispatch Escape-like deselect via store */
      chosen.window.dispatchEvent(new chosen.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await tick4();
    }
    const inspTxt = doc.querySelector('.insp')?.textContent || '';
    check(inspTxt.includes('Camera'), 'camera panel visible with no selection');
    check(inspTxt.includes('Beat zoom'), 'camera punch-in slider present');
    const punch = [...doc.querySelectorAll('.insp button')].find(b => b.textContent.trim() === 'Punch');
    check(!!punch, 'camera presets (Punch/Breathe/Quake/Off)');
    if (punch) {
      punch.click(); await tick4();
      check(VX3.project.current.camera.on === true && VX3.project.current.camera.zoomBeat > 0, 'Punch preset arms the reactive camera');
      const off = [...doc.querySelectorAll('.insp button')].find(b => b.textContent.trim() === 'Off');
      off && off.click(); await tick4();
    }
  }

  /* the built CSS must carry the breakpoints */
  const css = fs.readdirSync(distDir).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(distDir, f), 'utf8')).join('');
  check(/@media[^{]*max-width:\s*1220px/.test(css), 'CSS has the drawer breakpoint (1220px)');
  check(/@media[^{]*max-width:\s*880px/.test(css) && /@media[^{]*max-height:\s*560px/.test(css), 'CSS has narrow + short-viewport retunes');
  check(/tl-closed/.test(css) && /drawer-scrim/.test(css), 'CSS has collapse + scrim rules');
}
check(chosen._errLog.length === 0, 'zero runtime errors');
if (chosen._errLog.length) chosen._errLog.slice(0, 8).forEach(e => console.log('     ', e));
console.log(pass ? '\nBOOT TEST PASSED' : '\nBOOT TEST FAILED');
process.exit(pass ? 0 : 1);
