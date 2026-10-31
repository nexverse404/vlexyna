/**
 * Vlexyna — main wiring.
 * Owns state, playback, file routing, panels, and the export flow.
 */

import './styles.css';

import { analyzeAudio, type AudioFeatures } from './engine/analysis';
import { createScene, renderFrame, type Scene } from './engine/scene';
import { loadImageFromBlob, loadVideoFromBlob, type MediaAssets } from './engine/media';
import { resolvePalette } from './engine/palette';
import { clearSettings, defaultSettings, loadSettings, saveSettings, type ProjectSettings } from './state';
import { buildChips, buildPanel, type PanelApp } from './ui/panels';
import { Timeline } from './ui/timeline';
import { toast } from './ui/toast';
import { ExportCancelled, canUseWebCodecs, exportVideo, type ExportResult } from './export/encode';
import { fmtBytes, fmtTime } from './ui/controls';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

const settings: ProjectSettings = loadSettings() ?? defaultSettings();

let audioName: string | null = null;
let audioBuffer: AudioBuffer | null = null;
let audioUrl: string | null = null;
let features: AudioFeatures | null = null;

let bgName: string | null = null;
let logoName: string | null = null;
const media: MediaAssets = {};

let actx: AudioContext | null = null;
const audioEl = new Audio();
audioEl.preload = 'auto';

let playing = false;
let time = 0;
let needsRender = true;
let scene: Scene | null = null;

let activePanel = 'track';
let exporting = false;
let exportCancelled = false;

// ---------------------------------------------------------------------------
// dom
// ---------------------------------------------------------------------------

const view = $<HTMLCanvasElement>('#view');
const vctx = view.getContext('2d', { alpha: false })!;
const emptyEl = $<HTMLElement>('#empty');
const playBtn = $<HTMLButtonElement>('#btn-play');
const timeLabel = $<HTMLElement>('#time');
const chipsEl = $<HTMLElement>('#chips');
const panelEl = $<HTMLElement>('#panel');
const timelineCanvas = $<HTMLCanvasElement>('#timeline');
const veil = $<HTMLElement>('#drag-veil');
const fileTrack = $<HTMLInputElement>('#file-track');

const app: PanelApp = {
  settings,
  hasAudio: () => features != null,
  audioName: () => audioName,
  features: () => features,
  bgName: () => bgName,
  logoName: () => logoName,
  analysis: { active: false, fraction: 0, label: '' },
  exportState: { running: false, fraction: 0, label: '' },
  lastExport: null,
  loadAudio,
  loadBg,
  clearBg,
  loadLogo,
  clearLogo,
  loadDemo,
  seek,
  changed,
  rebuild: () => rebuildPanel(),
  setBadgeCorner,
  startExport,
  savePoster,
  cancelExport: () => {
    exportCancelled = true;
  },
  onAnalysisProgress: null,
  onExportProgress: null,
};

const timeline = new Timeline(timelineCanvas, {
  features: () => features,
  settings,
  getTime: () => time,
  seek,
});

// ---------------------------------------------------------------------------
// scene & render
// ---------------------------------------------------------------------------

function rebuildScene(): void {
  if (!features) {
    scene = null;
  } else {
    scene = createScene(features, settings, media, resolvePalette(settings.grade.preset, settings.grade.custom));
  }
  needsRender = true;
}

function drawIdle(): void {
  const pal = resolvePalette(settings.grade.preset, settings.grade.custom);
  vctx.setTransform(1, 0, 0, 1, 0, 0);
  vctx.fillStyle = pal.base;
  vctx.fillRect(0, 0, view.width, view.height);
}

function renderPreview(): void {
  if (!scene || !features) {
    drawIdle();
    return;
  }
  const t = Math.max(0, Math.min(time, features.duration));
  renderFrame(scene, vctx, view.width, view.height, t);
  drawMoveOverlay();
}

// ---------------------------------------------------------------------------
// direct manipulation — grab the badge / spectrum / flare and drag them
// ---------------------------------------------------------------------------

type MovableKind = 'badge' | 'spectrum' | 'flare';
let hoverKind: MovableKind | null = null;
let dragKind: MovableKind | null = null;
const dragGrab = { dx: 0, dy: 0 };

function hitTest(mx: number, my: number): MovableKind | null {
  if (!scene) return null;
  const L = scene.layout;
  const pad = 14 * (view.width / 1280);
  if (L.badge && mx >= L.badge.x - pad && mx <= L.badge.x + L.badge.w + pad && my >= L.badge.y - pad && my <= L.badge.y + L.badge.h + pad) {
    return 'badge';
  }
  if (L.spectrum) {
    const s = L.spectrum;
    if (mx >= s.x - pad && mx <= s.x + s.w + pad && my >= s.y - pad && my <= s.y + s.h + pad) {
      return 'spectrum';
    }
  }
  if (L.flare) {
    const d = Math.hypot(mx - L.flare.x, my - L.flare.y);
    if (d < 48 * (view.width / 1280)) return 'flare';
  }
  return null;
}

function viewCoords(e: PointerEvent): { mx: number; my: number } {
  const r = view.getBoundingClientRect();
  return {
    mx: ((e.clientX - r.left) / r.width) * view.width,
    my: ((e.clientY - r.top) / r.height) * view.height,
  };
}

view.addEventListener('pointerdown', (e) => {
  if (!scene || !features) return;
  const { mx, my } = viewCoords(e);
  const hit = hitTest(mx, my);
  if (!hit) return;
  e.preventDefault();
  view.setPointerCapture(e.pointerId);
  dragKind = hit;
  if (hit === 'badge') {
    dragGrab.dx = settings.badge.x - mx / view.width;
    dragGrab.dy = settings.badge.y - my / view.height;
  } else if (hit === 'spectrum') {
    dragGrab.dx = settings.spectrum.x - mx / view.width;
    dragGrab.dy = settings.spectrum.y - my / view.height;
  } else {
    dragGrab.dx = settings.flare.x - mx / view.width;
    dragGrab.dy = settings.flare.y - my / view.height;
  }
  view.style.cursor = 'grabbing';
  needsRender = true;
});

view.addEventListener('pointermove', (e) => {
  if (!scene || !features) return;
  const { mx, my } = viewCoords(e);
  if (dragKind) {
    const nx = mx / view.width + dragGrab.dx;
    const ny = my / view.height + dragGrab.dy;
    if (dragKind === 'badge') {
      const b = scene.layout.badge;
      const halfW = b ? b.w / 2 / view.width : 0.1;
      const halfH = b ? b.h / 2 / view.height : 0.06;
      settings.badge.x = Math.min(1 - halfW, Math.max(halfW, nx));
      settings.badge.y = Math.min(1 - halfH, Math.max(halfH, ny));
    } else if (dragKind === 'spectrum') {
      const halfW = settings.spectrum.width / 2;
      settings.spectrum.x = Math.min(1 - halfW, Math.max(halfW, nx));
      settings.spectrum.y = Math.min(1, Math.max(0.12, ny));
    } else {
      settings.flare.x = Math.min(1, Math.max(0, nx));
      settings.flare.y = Math.min(1, Math.max(0, ny));
    }
    needsRender = true;
    return;
  }
  const hit = hitTest(mx, my);
  if (hit !== hoverKind) {
    hoverKind = hit;
    view.style.cursor = hit ? 'grab' : 'default';
    needsRender = true;
  }
});

function endDrag(): void {
  if (!dragKind) return;
  dragKind = null;
  view.style.cursor = hoverKind ? 'grab' : 'default';
  changed();
  rebuildPanel();
}
view.addEventListener('pointerup', endDrag);
view.addEventListener('pointercancel', endDrag);
view.addEventListener('pointerleave', () => {
  if (!dragKind && hoverKind) {
    hoverKind = null;
    view.style.cursor = 'default';
    needsRender = true;
  }
});

function drawMoveOverlay(): void {
  const k = dragKind ?? hoverKind;
  if (!k || !scene) return;
  const L = scene.layout;
  const u = view.height / 720;
  const ctx = vctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  let label = '';
  let lx = 0;
  let ly = 0;
  if (k === 'badge' && L.badge) {
    const b = L.badge;
    ctx.strokeRect(b.x - 6 * u, b.y - 6 * u, b.w + 12 * u, b.h + 12 * u);
    label = 'Badge — drag to move';
    lx = b.x;
    ly = b.y - 10 * u;
  } else if (k === 'spectrum' && L.spectrum) {
    const s = L.spectrum;
    ctx.strokeRect(s.x, s.y, s.w, s.h);
    label = 'Spectrum — drag to move';
    lx = s.x + 4 * u;
    ly = Math.max(16 * u, s.y - 8 * u);
  } else if (k === 'flare' && L.flare) {
    const f = L.flare;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 11 * u, 0, Math.PI * 2);
    ctx.stroke();
    label = 'Flare — drag to move';
    lx = f.x + 16 * u;
    ly = f.y - 8 * u;
  }
  if (label) {
    ctx.setLineDash([]);
    ctx.font = `600 ${11.5 * u}px Inter, system-ui, sans-serif`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(10,8,20,0.85)';
    ctx.fillRect(lx - 5 * u, ly - 12 * u, tw + 10 * u, 17 * u);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, lx, ly);
  }
  ctx.restore();
}

/** Snap the badge to a corner using its current rendered size. */
function setBadgeCorner(c: 'bl' | 'br' | 'tl' | 'tr'): void {
  const b = scene?.layout.badge;
  const bw = b ? b.w / view.width : 0.22;
  const bh = b ? b.h / view.height : 0.12;
  const mx = 0.045;
  const my = 0.05;
  settings.badge.x = c === 'br' || c === 'tr' ? 1 - mx - bw / 2 : mx + bw / 2;
  settings.badge.y = c === 'tl' || c === 'tr' ? my + bh / 2 : 1 - my - bh / 2;
  changed();
  rebuildPanel();
}

function loop(): void {
  if (exporting) {
    // the exporter owns the scene (and its feedback buffer) right now
    requestAnimationFrame(loop);
    return;
  }
  if (playing && features) {
    time = audioEl.currentTime;
    needsRender = true;
  }
  if (needsRender) {
    renderPreview();
    timeline.draw();
    timeLabel.innerHTML = `${fmtTime(time)}&thinsp;/&thinsp;${fmtTime(features?.duration ?? 0)}`;
    needsRender = false;
  }
  requestAnimationFrame(loop);
}

function updateTimeAndPlayClass(): void {
  playBtn.classList.toggle('playing', playing);
}

// ---------------------------------------------------------------------------
// playback
// ---------------------------------------------------------------------------

async function togglePlay(): Promise<void> {
  if (!features) {
    toast('Load a track first — drop one anywhere on the page.', 'info');
    return;
  }
  if (playing) {
    audioEl.pause();
    return;
  }
  try {
    if (actx) await actx.resume();
    if (time >= features.duration - 0.05) time = 0;
    audioEl.currentTime = time;
    if (media.bgVideo) media.bgVideo.currentTime = time % (media.bgVideo.duration || 1);
    await audioEl.play();
    media.bgVideo?.play().catch(() => undefined);
  } catch {
    toast('Playback was blocked — click play again.', 'error');
  }
}

audioEl.addEventListener('play', () => {
  playing = true;
  updateTimeAndPlayClass();
});
audioEl.addEventListener('pause', () => {
  playing = false;
  media.bgVideo?.pause();
  needsRender = true;
  updateTimeAndPlayClass();
});
audioEl.addEventListener('ended', () => {
  playing = false;
  updateTimeAndPlayClass();
});

function seek(t: number): void {
  if (!features) return;
  time = Math.max(0, Math.min(t, features.duration));
  if (!audioEl.paused || audioEl.readyState >= 1) audioEl.currentTime = time;
  if (media.bgVideo && Number.isFinite(media.bgVideo.duration)) {
    media.bgVideo.currentTime = time % media.bgVideo.duration;
  }
  needsRender = true;
}

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------

async function loadAudio(file: File): Promise<void> {
  app.analysis.active = true;
  app.analysis.fraction = 0;
  app.analysis.label = 'Decoding';
  rebuildPanel();
  try {
    actx ??= new AudioContext();
    await actx.resume();
    const raw = await file.arrayBuffer();
    const buffer = await actx.decodeAudioData(raw);
    audioBuffer = buffer;
    audioName = file.name;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(file);
    audioEl.src = audioUrl;
    audioEl.load();
    audioEl.currentTime = 0;
    time = 0;
    playing = false;
    updateTimeAndPlayClass();
    settings.motion.dropTimeOverride = null;
    settings.exportCfg.trimStart = 0;
    settings.exportCfg.trimEnd = null;
    app.analysis.label = 'Listening';
    const F = await analyzeAudio(buffer, (f, label) => {
      app.analysis.fraction = f;
      app.onAnalysisProgress?.(f, label);
    });
    features = F;
    emptyEl.hidden = true;
    // first track: fill the badge title from the file name unless it was customized
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().toUpperCase();
    if (settings.badge.title === 'FANTASIZE' && base) settings.badge.title = base.slice(0, 48);
    rebuildScene();
    rebuildPanel();
    timeline.draw();
    saveSettings(settings);
    const dropNote = F.dropTime != null ? `, drop at ${fmtTime(F.dropTime)}` : '';
    toast(`Track locked — ${F.bpm} BPM${dropNote}`, 'success');
  } catch (err) {
    console.error(err);
    toast('Could not read that audio file. MP3 and WAV are safest.', 'error');
  } finally {
    app.analysis.active = false;
    app.onAnalysisProgress = null;
    rebuildPanel();
  }
}

async function loadBg(file: File): Promise<void> {
  try {
    if (file.type.startsWith('video/')) {
      const v = await loadVideoFromBlob(file);
      media.bgVideo = v;
      media.bgImage = undefined;
    } else {
      const img = await loadImageFromBlob(file);
      media.bgImage = img;
      media.bgVideo = undefined;
    }
    bgName = file.name;
    if (media.bgVideo && playing) media.bgVideo.play().catch(() => undefined);
    rebuildScene();
    rebuildPanel();
  } catch (err) {
    console.error(err);
    toast('Could not read that image or video.', 'error');
  }
}

function clearBg(): void {
  media.bgImage = undefined;
  media.bgVideo = undefined;
  bgName = null;
  rebuildScene();
  rebuildPanel();
}

async function loadLogo(file: File): Promise<void> {
  try {
    media.logo = await loadImageFromBlob(file);
    logoName = file.name;
    rebuildScene();
    rebuildPanel();
  } catch {
    toast('Could not read that logo image.', 'error');
  }
}

function clearLogo(): void {
  media.logo = undefined;
  logoName = null;
  rebuildScene();
  rebuildPanel();
}

async function loadDemo(): Promise<void> {
  try {
    const [audioRes, bgRes] = await Promise.all([
      fetch('./demo/fantasize-demo.mp3'),
      fetch('./demo/demo-bg.jpg'),
    ]);
    if (!audioRes.ok || !bgRes.ok) throw new Error('demo assets not found');
    const audioBlob = await audioRes.blob();
    await loadAudio(new File([audioBlob], 'demo — 126 bpm.mp3', { type: 'audio/mpeg' }));
    const bgBlob = await bgRes.blob();
    await loadBg(new File([bgBlob], 'demo artwork.jpg', { type: 'image/jpeg' }));
    seek(0);
    // the click on "Try the demo" is the user gesture — start playing right away
    void audioEl.play().catch(() => undefined);
    media.bgVideo?.play().catch(() => undefined);
  } catch (err) {
    console.error(err);
    toast('Could not load the demo assets.', 'error');
  }
}

// ---------------------------------------------------------------------------
// settings changes + undo/redo
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const undoStack: string[] = [];
const redoStack: string[] = [];
let lastCommitted: string = JSON.stringify(settings);
let commitTimer: ReturnType<typeof setTimeout> | null = null;

function deepAssign(target: Record<string, unknown>, src: Record<string, unknown>): void {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      target[k] !== null &&
      typeof target[k] === 'object' &&
      !Array.isArray(target[k])
    ) {
      deepAssign(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      target[k] = v;
    }
  }
}

/** A tweak becomes one undo step once the user stops touching things. */
function scheduleCommit(): void {
  if (commitTimer) clearTimeout(commitTimer);
  commitTimer = setTimeout(() => {
    commitTimer = null;
    const now = JSON.stringify(settings);
    if (now !== lastCommitted) {
      undoStack.push(lastCommitted);
      if (undoStack.length > 60) undoStack.shift();
      redoStack.length = 0;
      lastCommitted = now;
    }
  }, 650);
}

function applySettingsSnapshot(snap: string): void {
  deepAssign(settings as unknown as Record<string, unknown>, JSON.parse(snap) as Record<string, unknown>);
  rebuildScene();
  rebuildPanel();
  saveSettings(settings);
  needsRender = true;
}

function undo(): void {
  const snap = undoStack.pop();
  if (snap === undefined) {
    toast('Nothing to undo', 'info', 1200);
    return;
  }
  redoStack.push(lastCommitted);
  lastCommitted = snap;
  applySettingsSnapshot(snap);
  toast('Undid', 'info', 1100);
}

function redo(): void {
  const snap = redoStack.pop();
  if (snap === undefined) {
    toast('Nothing to redo', 'info', 1200);
    return;
  }
  undoStack.push(lastCommitted);
  lastCommitted = snap;
  applySettingsSnapshot(snap);
  toast('Redid', 'info', 1100);
}

function changed(): void {
  rebuildScene();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSettings(settings), 350);
  scheduleCommit();
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

function outputName(ext: 'mp4' | 'webm'): string {
  const base =
    settings.badge.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'vlexyna';
  return `${base}-visualizer.${ext}`;
}

/** Render the current frame at export resolution and download it as a PNG. */
function savePoster(): void {
  if (!scene || !features) return;
  const W = settings.exportCfg.width;
  const H = settings.exportCfg.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const c2 = c.getContext('2d', { alpha: false });
  if (!c2) return;
  renderFrame(scene, c2, W, H, Math.min(time, features.duration));
  const base =
    settings.badge.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'vlexyna';
  c.toBlob((b) => {
    if (!b) {
      toast('Could not encode the poster.', 'error');
      return;
    }
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}-poster.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, 'image/png');
}

async function startExport(): Promise<void> {
  if (!features || !audioBuffer || exporting) return;
  if (app.analysis.active) {
    toast('Still analyzing the track — one moment.', 'info');
    return;
  }
  exporting = true;
  exportCancelled = false;
  audioEl.pause();

  app.exportState.running = true;
  app.exportState.fraction = 0;
  app.exportState.label = 'Starting…';
  rebuildPanel();

  rebuildScene();
  const S = settings.exportCfg;
  const trimStart = Math.min(S.trimStart, features.duration - 1);
  const trimEnd = Math.max(trimStart + 1, S.trimEnd ?? features.duration);

  try {
    if (!scene) throw new Error('Nothing to render');
    const result: ExportResult = await exportVideo({
      scene,
      audioBuffer,
      trimStart,
      trimEnd,
      width: S.width,
      height: S.height,
      fps: S.fps,
      quality: S.quality,
      onProgress: (f, label) => {
        app.exportState.fraction = f;
        app.exportState.label = label;
        app.onExportProgress?.(f, label);
      },
      shouldCancel: () => exportCancelled,
    });

    const filename = outputName(result.extension);
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

    app.lastExport = { filename, size: result.blob.size, mode: result.mode };
    toast(
      `Rendered ${filename} — ${fmtBytes(result.blob.size)} ${
        result.mode === 'webcodecs' ? 'MP4' : 'WebM (realtime fallback)'
      }`,
      'success',
      6000,
    );
  } catch (err) {
    if (err instanceof ExportCancelled) {
      toast('Export cancelled.', 'info');
    } else {
      console.error(err);
      toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, 'error', 7000);
    }
  } finally {
    exporting = false;
    app.exportState.running = false;
    app.onExportProgress = null;
    rebuildPanel();
  }
}

// ---------------------------------------------------------------------------
// panels
// ---------------------------------------------------------------------------

function rebuildPanel(): void {
  buildChips(chipsEl, activePanel, (id) => {
    activePanel = id;
    rebuildPanel();
  });
  buildPanel(panelEl, activePanel, app);
}

// ---------------------------------------------------------------------------
// shell events
// ---------------------------------------------------------------------------

playBtn.addEventListener('click', () => void togglePlay());
view.addEventListener('dblclick', () => void togglePlay());

const loopBtn = $<HTMLButtonElement>('#btn-loop');
loopBtn.addEventListener('click', () => {
  audioEl.loop = !audioEl.loop;
  loopBtn.classList.toggle('active', audioEl.loop);
});

// project save / open
$<HTMLButtonElement>('#btn-save').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vlexyna-project.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  toast('Project saved. Media files stay on your machine — keep them alongside the .json.', 'success', 5200);
});

const fileProject = $<HTMLInputElement>('#file-project');
$<HTMLButtonElement>('#btn-open').addEventListener('click', () => fileProject.click());
fileProject.addEventListener('change', () => {
  const f = fileProject.files?.[0];
  if (f) void openProject(f);
  fileProject.value = '';
});

async function openProject(file: File): Promise<void> {
  try {
    const parsed: unknown = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    deepAssign(settings as unknown as Record<string, unknown>, parsed as Record<string, unknown>);
    undoStack.push(lastCommitted);
    lastCommitted = JSON.stringify(settings);
    rebuildScene();
    rebuildPanel();
    saveSettings(settings);
    needsRender = true;
    toast('Project loaded.', 'success');
  } catch {
    toast('That does not look like a Vlexyna project file.', 'error');
  }
}

$<HTMLButtonElement>('#btn-demo').addEventListener('click', () => void loadDemo());
$<HTMLButtonElement>('#btn-pick-track').addEventListener('click', () => fileTrack.click());
fileTrack.addEventListener('change', () => {
  const f = fileTrack.files?.[0];
  if (f) void loadAudio(f);
  fileTrack.value = '';
});

$<HTMLButtonElement>('#btn-export-top').addEventListener('click', () => {
  if (!features) {
    toast('Load a track first.', 'info');
    return;
  }
  activePanel = 'export';
  rebuildPanel();
  void startExport();
});

$<HTMLButtonElement>('#btn-new').addEventListener('click', () => {
  if (!confirm('Start over? The current track, background, logo and settings will be cleared.')) return;
  audioEl.pause();
  audioEl.removeAttribute('src');
  audioEl.load();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
  audioName = null;
  audioBuffer = null;
  features = null;
  bgName = null;
  logoName = null;
  media.bgImage = undefined;
  media.bgVideo = undefined;
  media.logo = undefined;
  Object.assign(settings, defaultSettings());
  clearSettings();
  undoStack.length = 0;
  redoStack.length = 0;
  lastCommitted = JSON.stringify(settings);
  time = 0;
  emptyEl.hidden = false;
  activePanel = 'track';
  rebuildScene();
  rebuildPanel();
  timeline.draw();
  toast('Fresh start.', 'info');
});

// drag & drop routing
let dragDepth = 0;

function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
}

window.addEventListener('dragenter', (e) => {
  if (hasFiles(e)) {
    dragDepth++;
    veil.hidden = false;
  }
});
window.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) veil.hidden = true;
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  veil.hidden = true;
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name)) {
    void loadAudio(f);
  } else if (f.type.startsWith('image/') || f.type.startsWith('video/')) {
    void loadBg(f);
  } else {
    toast('That file type is not supported — audio, image or video.', 'error');
  }
});

window.addEventListener('keydown', (e) => {
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (e.code === 'Space') {
    e.preventDefault();
    void togglePlay();
  } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  } else if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y')) {
    e.preventDefault();
    redo();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    seek(time - (e.shiftKey ? 5 : 1 / 30));
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    seek(time + (e.shiftKey ? 5 : 1 / 30));
  } else if (e.key === 'Home') {
    seek(0);
  } else if (e.key === 'End') {
    if (features) seek(features.duration);
  } else if (e.key.toLowerCase() === 'l') {
    loopBtn.click();
  }
});

window.addEventListener('resize', () => {
  timeline.draw();
});

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

if (!canUseWebCodecs()) {
  // surfaced gently in the export panel too
  console.info('WebCodecs unavailable — export will use the realtime MediaRecorder fallback.');
}

void document.fonts?.load('80px "Bebas Neue"').catch(() => undefined);
void document.fonts?.load('600 14px Inter').catch(() => undefined);
document.fonts?.ready.then(() => {
  needsRender = true;
});

rebuildPanel();
needsRender = true;
requestAnimationFrame(loop);
