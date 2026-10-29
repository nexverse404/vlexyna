/* appctl.js — the app controller: defines VX.app, boots the engine, bridges to the store */
import '../engine/index.js';
import { S, syncAll, syncTransport, touch, touchTl, openModal, toast } from './store.js';

const VX = window.VX;
S.vx = VX;

VX.app = {
  playing: false, time: 0, loop: true, muted: false, micOn: false, exporting: false,
  previewQuality: 720, zoom: 1,
  duration() {
    const eng = VX.audio.engine;
    return eng.duration || (VX.project.current && VX.project.current.duration) || 30;
  },
  play() {
    VX.audio.engine.resume();
    if (VX.audio.engine.buffer) {
      VX.audio.engine.setLoop(VX.app.loop);
      VX.audio.engine.play();
      VX.app.playing = VX.audio.engine.playing;
    } else VX.app.playing = true;
    syncTransport();
  },
  pause() {
    VX.audio.engine.pause();
    VX.app.playing = false;
    syncTransport();
  },
  togglePlay() { VX.app.playing ? VX.app.pause() : VX.app.play(); },
  seekTo(t) {
    VX.app.time = Math.max(0, Math.min(VX.app.duration(), t));
    if (VX.audio.engine.buffer) VX.audio.engine.seek(VX.app.time);
    S.time = VX.app.time;
  },
  onFrame(dt) {
    S.time = VX.app.time;
    S.playing = VX.app.playing;
    S.dur = VX.app.duration();
    const b = VX.audio.engine.bands;
    if (b) { S.bands.bass = b.bass; S.bands.mid = b.mid; S.bands.treble = b.treble; S.bands.level = b.level; S.bands.beat = VX.audio.engine.beat; }
  },
  onExportProgress: null,
};

/* engine → UI hooks (the engine calls VX.ui.* — we route them into the store) */
VX.ui = {
  updateFPS: (f) => { S.fps = f; },
  drawOverlay: () => { },
  updateTransport: () => syncTransport(),
  updateUndo: () => { S.canUndo = VX.project.undoStack.length >= 2; S.canRedo = VX.project.redoStack.length > 0; },
  updateSaved: () => { S.savedFlash = Date.now(); },
  refreshAll: () => syncAll(),
  refreshInspector: () => touch(),
  refreshTimeline: () => touchTl(),
  openLyricsEditor: (layer) => openModal('lyrics', { layer }),
  openCropper: (layer) => openModal('crop', { layer }),
};

/* Boot the project store immediately (synchronous localStorage read) so Vue
   components can safely read VX.project.current from the very first render. */
VX.project.init();

export async function boot(canvas) {
  if (S.booted) return;
  if (!VX.project.current.layers.length) {
    /* first run (or a genuinely empty saved project) — start from the Blank template */
    const blank = VX.templates.list.find(t => t.name === 'Blank');
    if (blank) {
      VX.project.current.layers = blank.layers.map(l => {
        const m = VX.layers.make(l.type);
        if (!m) return null;
        for (const k of ['name', 'x', 'y', 'scale', 'rotation', 'opacity', 'blend', 'mirror', 'start', 'end', 'auto'])
          if (l[k] !== undefined) m[k] = JSON.parse(JSON.stringify(l[k]));
        if (l.props) Object.assign(m.props, l.props);
        if (l.fx) m.fx = l.fx.map(f => ({ ...f, params: { ...f.params } }));
        return m;
      }).filter(Boolean);
      VX.project.saveNow();
    }
  }
  VX.audio.engine.onstate = () => {
    if (VX.audio.engine.playing !== VX.app.playing) { VX.app.playing = VX.audio.engine.playing; }
    syncTransport();
  };
  VX.audio.engine.onended = () => VX.app.pause();
  VX.renderer.start(canvas);
  S.booted = true;
  syncAll();
}

export async function loadAudioFile(f) {
  try {
    toast('Decoding ' + f.name + '…');
    await VX.audio.engine.loadFile(f);
    VX.app.time = 0;
    VX.project.current.audioName = f.name;
    syncAll();
    toast(`Audio loaded — ${Math.floor(VX.audio.engine.duration / 60)}:${String(Math.round(VX.audio.engine.duration % 60)).padStart(2, '0')}`);
    VX.app.play();
  } catch (e) { toast('Could not decode that audio file', 'err'); }
}

export async function loadDemo() {
  toast('Synthesizing demo beat…');
  await VX.audio.engine.loadDemo();
  VX.app.time = 0;
  syncAll();
  toast('Demo beat ready');
  VX.app.play();
}

export async function handleDrop(f) {
  const U = VX.util;
  if (f.name.endsWith('.vlx')) { await VX.project.importFile(f); syncAll(); return; }
  if (f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(f.name)) { await loadAudioFile(f); return; }
  if (f.type.startsWith('image/')) {
    const id = await VX.assets.addFile(f);
    const l = VX.layers.make('image'); l.props.assetId = id; l.name = f.name.slice(0, 24);
    VX.project.current.layers.push(l); VX.project.snapshot('drop image');
    S.sel = l.id; syncAll(); toast('Image added');
    return;
  }
  if (f.type.startsWith('video/')) {
    const id = await VX.assets.addFile(f);
    const l = VX.layers.make('video'); l.props.assetId = id; l.name = f.name.slice(0, 24);
    VX.project.current.layers.push(l); VX.project.snapshot('drop video');
    S.sel = l.id; syncAll(); toast('Video added');
    return;
  }
  if (/\.(lrc|ttml|txt)$/i.test(f.name)) {
    const text = await U.readText(f);
    const lines = f.name.endsWith('ttml') ? VX.layers.parseTTML(text) : VX.layers.parseLRC(text);
    let lyr = VX.project.current.layers.find(l => l.type === 'lyrics');
    if (!lyr) { lyr = VX.layers.make('lyrics'); VX.project.current.layers.push(lyr); }
    lyr.props.lines = lines;
    VX.project.snapshot('import lyrics');
    S.sel = lyr.id; syncAll();
    toast(`Imported ${lines.length} lyric lines`);
    return;
  }
  if (/\.json$/i.test(f.name) || (f.type || '').includes('json')) {
    /* Lottie animation files become a Lottie layer */
    let data = null;
    try { data = JSON.parse(await U.readText(f)); } catch (e) { toast('That file is not valid JSON', 'warn'); return; }
    if (data && data.v && data.fr && Array.isArray(data.layers)) {
      const id = await VX.assets.addFile(f);
      const l = VX.layers.make('lottie'); l.props.assetId = id; l.name = f.name.slice(0, 24);
      VX.project.current.layers.push(l); VX.project.snapshot('drop lottie');
      S.sel = l.id; syncAll(); toast('Lottie animation added');
    } else {
      toast('JSON file is not a Lottie animation (needs v / fr / layers)', 'warn');
    }
    return;
  }
  toast('Unsupported file: ' + f.name, 'warn');
}
