<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { S, closeModal, toast, confirmDlg, promptDlg, syncAll, fmtTime, touch } from '../store.js';
import { loadDemo } from '../appctl.js';
import { U } from '../../engine/util.js';

const M = computed(() => S.modal);

/* ───────── export ───────── */
const exp = ref({ mode: 'video', includeAudio: true, monitor: false, bitrate: 16, fps: 60, codec: 'avc' });
const gif = ref({ width: 480, fps: 12 });
const sizeEstimate = computed(() => {
  if (exp.value.mode === 'frames') return `${Math.ceil(S.dur * Math.min(exp.value.fps, 30))} PNGs`;
  const mb = (exp.value.bitrate * 1e6 * S.dur) / 1e6;
  return mb > 1024 ? `≈ ${(mb / 1024).toFixed(1)} GB` : `≈ ${mb.toFixed(0)} MB`;
});
const canAudio = computed(() => S.audio.has);
const canOffline = computed(() => typeof window !== 'undefined' && !!window.VideoEncoder);
function setProgress(p, label) { S.expProg = p; S.expLabel = label || ''; }
function startExport() {
  const VX = S.vx;
  if (S.exporting) return;
  S.exporting = true; setProgress(0, 'Starting…');
  VX.app.onExportProgress = (p, t, dur) => setProgress(p, (typeof t === 'string' ? t : `${fmtTime(t)} / ${fmtTime(dur)}`));
  Promise.resolve(VX.exporter.exportVideo({
    includeAudio: exp.value.includeAudio && canAudio.value,
    monitor: exp.value.monitor,
    bitrate: exp.value.bitrate * 1e6,
    fps: exp.value.fps,
  })).finally(() => { S.exporting = false; VX.app.onExportProgress = null; syncAll(); });
  toast('Recording in real time — sit back');
}
function startOffline() {
  const VX = S.vx;
  if (S.exporting) return;
  S.exporting = true; setProgress(0, 'Analyzing audio…');
  VX.app.onExportProgress = (p, label) => setProgress(p, typeof label === 'string' ? label : '');
  Promise.resolve(VX.offline.exportMp4({
    bitrate: exp.value.bitrate * 1e6,
    fps: exp.value.fps,
    codec: exp.value.codec,
  })).finally(() => { S.exporting = false; VX.app.onExportProgress = null; syncAll(); });
}
function startFrames() {
  const VX = S.vx;
  if (S.exporting) return;
  S.exporting = true; setProgress(0, 'Analyzing audio…');
  VX.app.onExportProgress = (p, label) => setProgress(p, typeof label === 'string' ? label : '');
  Promise.resolve(VX.exporter.exportFrames({ fps: Math.min(exp.value.fps, 30) }))
    .finally(() => { S.exporting = false; VX.app.onExportProgress = null; syncAll(); });
}
function startGif() {
  const VX = S.vx;
  if (S.exporting) return;
  S.exporting = true; setProgress(0, 'Analyzing audio…');
  VX.app.onExportProgress = (p, label) => setProgress(p, typeof label === 'string' ? label : '');
  Promise.resolve(VX.offline.exportGif({ fps: gif.value.fps, width: gif.value.width }))
    .finally(() => { S.exporting = false; VX.app.onExportProgress = null; syncAll(); });
}
function cancelExport() {
  const VX = S.vx;
  if (VX.offline && VX.offline.active) VX.offline.cancel();
  else VX.exporter.cancel();
}

/* ───────── global variables ───────── */
const gvars = ref([]);
watch(() => S.modal?.type, (t) => {
  if (t === 'globals') {
    const v = S.vx?.project?.current?.vars || {};
    gvars.value = Object.entries(v).map(([name, value]) => ({ name, value: String(value) }));
  }
}, { immediate: true });
function addVar() { gvars.value.push({ name: 'var' + (gvars.value.length + 1), value: '0' }); saveVars(); }
function delVar(i) { gvars.value.splice(i, 1); saveVars(); }
function saveVars() {
  const VX = S.vx;
  const out = {};
  for (const g of gvars.value) {
    const n = g.name.trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) out[n] = +g.value || 0;
  }
  if (!('v1' in out)) { /* keep template vars alive */ }
  VX.project.current.vars = out;
  VX.project.snapshot('global variables');
}

/* ───────── audio reactivity mixer ───────── */
const rx = reactive({ bass: 1, mid: 1, treble: 1, level: 1, beat: 1 });
watch(() => S.modal?.type, (t) => {
  if (t === 'reactivity') Object.assign(rx, S.vx?.audio?.engine?.gains || rx);
}, { immediate: true });
function setRx(k, e) {
  const v = +e.target.value;
  rx[k] = v;
  const g = S.vx?.audio?.engine?.gains;
  if (g) g[k] = v;
  try { localStorage.setItem('vlexyna_reactivity', JSON.stringify({ ...rx })); } catch (err) { }
}
function resetRx() {
  for (const k of Object.keys(rx)) { rx[k] = 1; const g = S.vx?.audio?.engine?.gains; if (g) g[k] = 1; }
  try { localStorage.setItem('vlexyna_reactivity', JSON.stringify({ ...rx })); } catch (err) { }
}

/* ───────── crop editor ───────── */
const cropLayer = computed(() => S.modal?.layer || null);
const cropRect = ref({ x: 0, y: 0, w: 1, h: 1 });
const cropCv = ref(null);
watch(() => S.modal?.type, (t) => {
  if (t === 'crop' && cropLayer.value) {
    const p = cropLayer.value.props;
    cropRect.value = { x: p.cropX || 0, y: p.cropY || 0, w: p.cropW ?? 1, h: p.cropH ?? 1 };
    nextTick(drawCrop);
  }
}, { immediate: true });
function cropImageEl() {
  const a = S.vx.assets.get(cropLayer.value?.props?.assetId);
  return a ? a.el : null;
}
function drawCrop() {
  const c = cropCv.value, el = cropImageEl();
  if (!c || !el) return;
  const x = c.getContext('2d');
  const W = 460, H = 320;
  c.width = W * 2; c.height = H * 2;
  x.scale(2, 2);
  x.clearRect(0, 0, W, H);
  const iw = el.naturalWidth || 1, ih = el.naturalHeight || 1;
  const s = Math.min(W / iw, H / ih);
  const dw = iw * s, dh = ih * s, dx = (W - dw) / 2, dy = (H - dh) / 2;
  x.drawImage(el, dx, dy, dw, dh);
  const r = cropRect.value;
  /* dim everything outside the crop window */
  x.fillStyle = 'rgba(4,5,9,.66)';
  x.fillRect(dx, dy, dw, r.y * dh);
  x.fillRect(dx, dy + (r.y + r.h) * dh, dw, dh - (r.y + r.h) * dh);
  x.fillRect(dx, dy + r.y * dh, r.x * dw, r.h * dh);
  x.fillRect(dx + (r.x + r.w) * dw, dy + r.y * dh, dw - (r.x + r.w) * dw, r.h * dh);
  /* the window itself */
  x.strokeStyle = '#22d3ee';
  x.lineWidth = 1.5;
  x.strokeRect(dx + r.x * dw + .75, dy + r.y * dh + .75, r.w * dw - 1.5, r.h * dh - 1.5);
  x.fillStyle = 'rgba(34,211,238,.9)';
  for (const [hx, hy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    x.fillRect(dx + (r.x + hx * r.w) * dw - 3, dy + (r.y + hy * r.h) * dh - 3, 6, 6);
  }
}
function cropDown(e) {
  const c = cropCv.value;
  const el = cropImageEl();
  if (!c || !el) return;
  const rect = c.getBoundingClientRect();
  const iw = el.naturalWidth || 1, ih = el.naturalHeight || 1;
  const s = Math.min(c.clientWidth / iw, c.clientHeight / ih);
  const dw = iw * s, dh = ih * s, dx = (c.clientWidth - dw) / 2, dy = (c.clientHeight - dh) / 2;
  const toImg = (ev) => ({
    x: U.clamp((ev.clientX - rect.left - dx) / dw, 0, 1),
    y: U.clamp((ev.clientY - rect.top - dy) / dh, 0, 1),
  });
  const p0 = toImg(e);
  const move = (ev) => {
    const p1 = toImg(ev);
    cropRect.value = {
      x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y),
      w: Math.abs(p1.x - p0.x), h: Math.abs(p1.y - p0.y),
    };
    drawCrop();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}
function applyCrop() {
  const VX = S.vx, l = cropLayer.value;
  if (!l) { closeModal(); return; }
  let r = cropRect.value;
  if (r.w < .02 || r.h < .02) r = { x: 0, y: 0, w: 1, h: 1 }; /* too small = reset */
  l.props.cropX = +r.x.toFixed(4); l.props.cropY = +r.y.toFixed(4);
  l.props.cropW = +r.w.toFixed(4); l.props.cropH = +r.h.toFixed(4);
  VX.project.snapshot('crop image');
  touch();
  closeModal();
  toast(r.w >= 1 && r.h >= 1 ? 'Crop reset' : 'Crop applied');
}
function resetCrop() { cropRect.value = { x: 0, y: 0, w: 1, h: 1 }; drawCrop(); }

/* ───────── templates ───────── */
const templates = computed(() => S.vx ? S.vx.templates.list : []);
const tplRev = ref(0);
function saveAsTemplate() {
  const VX = S.vx;
  promptDlg('Template name', VX.project.current.name || 'My template', (n) => {
    VX.templates.saveCustom(n);
    tplRev.value++;
    toast('Saved — it stays in your template library');
  });
}
function removeTemplate(t) {
  confirmDlg(`Delete template “${t.name}”?`, () => { S.vx.templates.removeCustom(t.name); tplRev.value++; }, 'Delete');
}
function applyTemplate(t) { S.vx.templates.apply(t); closeModal(); S.sel = null; }


/* ───────── lyrics ───────── */
const lyrLayer = computed(() => S.modal?.layer || null);
const lyrText = ref('');
const lyrTa = ref(null);
watch(() => S.modal?.type, (t) => {
  if (t === 'lyrics' && lyrLayer.value) {
    lyrText.value = linesToText(lyrLayer.value.props.lines || []);
  }
}, { immediate: true });
const linesToText = (lines) => lines.map(l => (l.t == null ? '' : `[${fmtTime(l.t).slice(0, 8)}] `) + l.text).join('\n');
function saveLyrics() {
  const VX = S.vx, layer = lyrLayer.value;
  const raw = VX.layers.parseLRC(lyrText.value);
  const timed = raw.filter(l => l.t != null), untimed = raw.filter(l => l.t == null);
  layer.props.lines = [...timed, ...untimed];
  VX.project.snapshot('edit lyrics');
  touch();
  toast(`Lyrics saved — ${raw.length} lines (${untimed.length} untimed)`);
}
/* insert a [mm:ss.cc] stamp from the playhead at the text cursor */
function tapSync() {
  const ta = lyrTa.value;
  const stamp = `[${fmtTime(S.time).slice(0, 8)}] `;
  const pos = ta?.selectionStart ?? lyrText.value.length;
  lyrText.value = lyrText.value.slice(0, pos) + stamp + lyrText.value.slice(pos);
  if (ta) { const p = pos + stamp.length; requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(p, p); }); }
  toast(`Stamped ${fmtTime(S.time)} — cursor marked`);
}
function importLyrics(e) {
  const f = e.target.files[0];
  if (!f) return;
  U.readText(f).then(txt => {
    const ls = f.name.toLowerCase().endsWith('ttml') ? S.vx.layers.parseTTML(txt) : S.vx.layers.parseLRC(txt);
    lyrText.value = linesToText(ls);
    toast(`Parsed ${ls.length} lines from ${f.name}`);
  });
}

/* ───────── custom size ───────── */
const cs = ref({ w: 1920, h: 1080 });
const CS_PRESETS = [['1920', '1080', '16:9'], ['1080', '1920', '9:16'], ['1080', '1080', '1:1'], ['1280', '720', '720p'], ['2560', '1440', '1440p'], ['3840', '2160', '4K']];
function applySize() {
  const w = Math.round(+cs.value.w), h = Math.round(+cs.value.h);
  if (!(w >= 16 && w <= 7680 && h >= 16 && h <= 4320)) { toast('Size must be 16–7680 px per side', 'warn'); return; }
  const VX = S.vx;
  VX.project.current.width = w; VX.project.current.height = h;
  VX.project.snapshot('canvas size');
  syncAll(); closeModal();
}

/* ───────── automation editor (vizzy-style: expression + shaping) ───────── */
const autoExpr = ref('');
const autoEnabledV = ref(true);
const autoMin = ref('');
const autoMax = ref('');
const autoSmooth = ref('');
const autoErr = computed(() => {
  if (!S.vx || !autoExpr.value.trim()) return '';
  const err = S.vx.expr.check(autoExpr.value.trim());
  return err ? `⚠ ${err}` : '✓ expression valid';
});
watch(() => S.modal?.type, (t) => {
  if (t === 'auto') {
    const l = S.vx.project.current.layers.find(x => x.id === S.modal.layer);
    const a = l?.auto?.[S.modal.key];
    autoExpr.value = typeof a === 'string' ? (a || '') : (a?.expr || '');
    autoEnabledV.value = typeof a === 'string' ? true : (a?.enabled !== false);
    autoMin.value = (typeof a === 'object' && a?.min != null) ? a.min : '';
    autoMax.value = (typeof a === 'object' && a?.max != null) ? a.max : '';
    autoSmooth.value = (typeof a === 'object' && a?.smooth != null) ? a.smooth : '';
  }
}, { immediate: true });
function saveAuto() {
  const VX = S.vx;
  const l = VX.project.current.layers.find(x => x.id === S.modal.layer);
  if (l) {
    if (autoExpr.value.trim()) {
      const extras = (autoMin.value !== '' && autoMin.value != null) || (autoMax.value !== '' && autoMax.value != null) ||
                     (autoSmooth.value !== '' && autoSmooth.value != null) || autoEnabledV.value === false;
      l.auto = l.auto || {};
      l.auto[S.modal.key] = extras ? {
        expr: autoExpr.value.trim(),
        enabled: autoEnabledV.value,
        ...(autoMin.value !== '' && autoMin.value != null ? { min: +autoMin.value } : {}),
        ...(autoMax.value !== '' && autoMax.value != null ? { max: +autoMax.value } : {}),
        ...(autoSmooth.value !== '' && autoSmooth.value != null ? { smooth: +autoSmooth.value } : {}),
      } : autoExpr.value.trim();
    } else if (l.auto) delete l.auto[S.modal.key];
    VX.project.autosave();
    VX.renderer && VX.renderer.invalidate();
    touch();
  }
  closeModal();
}

/* ───────── prompt / confirm ───────── */
const promptVal = ref('');
watch(() => S.modal, (mm) => { if (mm?.type === 'prompt') promptVal.value = mm.def ?? ''; }, { immediate: true });
function confirmYes() { const yes = S.modal?.onYes; closeModal(false); yes && yes(); }
function promptOk() { const ok = S.modal?.onOk; const v = promptVal.value; closeModal(false); ok && ok(v); }

/* ───────── welcome ───────── */
async function welcomeDemo() { closeModal(); await loadDemo(); }
function welcomeTemplates() { S.modal = { type: 'templates' }; }
</script>

<template>
  <Teleport to="body">
    <div class="modal-wrap" v-if="M" @pointerdown.self="!S.exporting && closeModal()">
      <div class="modal" :class="'m-' + M.type">

        <!-- WELCOME -->
        <template v-if="M.type === 'welcome'">
          <div class="w-hero">
            <svg viewBox="0 0 32 32" width="54" height="54" aria-hidden="true">
              <defs><linearGradient id="wlg" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#7c5cff"/>
              </linearGradient></defs>
              <path d="M5 26V14M11 26V6M17 26v-11M23 26V10M28 26v-7" stroke="url(#wlg)" stroke-width="3" stroke-linecap="round" fill="none"/>
            </svg>
            <h2>Vlexyna</h2>
            <p class="w-sub">Music visualizer studio — {{ S.vx?.fx?.list?.length || 64 }} effects, {{ S.vx?.layers?.list?.length || 20 }} layer types, and everything reacts to your sound.</p>
          </div>
          <div class="w-actions">
            <button class="btn primary big" @click="welcomeDemo"><span v-html="U.icon('spark', 15)"></span>Try it — demo beat</button>
            <button class="btn big" @click="welcomeTemplates"><span v-html="U.icon('template', 15)"></span>Browse {{ templates.length }} templates</button>
            <button class="btn big" @click="closeModal()"><span v-html="U.icon('shape', 15)"></span>Start blank</button>
          </div>
          <p class="w-hint">Drop an MP3 anywhere, anytime. Press <b>?</b> for shortcuts.</p>
        </template>

        <!-- TEMPLATES -->
        <template v-else-if="M.type === 'templates'">
          <div class="m-h"><h3>Templates</h3>
            <button class="btn small" @click="saveAsTemplate" title="Turn the current project into a reusable template"><span v-html="U.icon('plus', 12)"></span>Save current as template</button>
            <button class="ib" @click="closeModal()" v-html="U.icon('close')"></button>
          </div>
          <div class="tpl-grid" :key="tplRev">
            <button v-for="t in templates" :key="t.name" class="tpl" :class="{ mine: t.custom }" @click="applyTemplate(t)">
              <span class="tpl-art"><span class="tpl-bars"><i v-for="i in 5" :key="i"></i></span></span>
              <span class="tpl-name">{{ t.name }}</span>
              <span class="tpl-desc">{{ t.desc }}</span>
              <span class="tpl-n lab">{{ t.layers.length }} layers<span v-if="t.custom"> · yours</span></span>
              <span v-if="t.custom" class="tpl-del" role="button" title="Delete template" @click.stop="removeTemplate(t)" v-html="U.icon('trash', 12)"></span>
            </button>
          </div>
        </template>

        <!-- EXPORT -->
        <template v-else-if="M.type === 'export'">
          <div class="m-h"><h3>Export</h3><button class="ib" v-if="!S.exporting" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <template v-if="!S.exporting">
            <div class="x-modes">
              <button :class="{ on: exp.mode === 'video' }" @click="exp.mode = 'video'">
                <b>Video</b><span>real-time recording</span>
              </button>
              <button :class="{ on: exp.mode === 'mp4' }" :disabled="!canOffline" @click="canOffline && (exp.mode = 'mp4')">
                <b>MP4 offline</b><span>{{ canOffline ? 'frame-exact · audio-reactive' : 'needs WebCodecs browser' }}</span>
              </button>
              <button :class="{ on: exp.mode === 'frames' }" @click="exp.mode = 'frames'">
                <b>PNG frames</b><span>zip sequence</span>
              </button>
              <button :class="{ on: exp.mode === 'gif' }" :disabled="!canAudio" @click="canAudio && (exp.mode = 'gif')">
                <b>GIF</b><span>{{ canAudio ? 'looping · social-ready' : 'needs an audio track' }}</span>
              </button>
            </div>
            <div class="x-row"><span>Canvas</span><b class="mono">{{ S.width }} × {{ S.height }} @ {{ S.fpsProj }} fps</b></div>
            <div class="x-row"><span>Duration</span><b class="mono">{{ fmtTime(S.dur) }} · {{ sizeEstimate }}</b></div>
            <div class="x-row" v-if="exp.mode === 'mp4'"><span>Video codec</span>
              <select v-model="exp.codec">
                <option value="avc">H.264 — everywhere</option>
                <option value="hevc">H.265 — smaller</option>
                <option value="vp9">VP9 — WebM</option>
                <option value="av1">AV1 — cutting edge</option>
              </select>
            </div>
            <div class="x-row" v-if="exp.mode === 'video'"><span>Audio track</span>
              <label class="sw-row"><input type="checkbox" v-model="exp.includeAudio" :disabled="!canAudio"> include audio</label>
            </div>
            <div class="x-row" v-if="exp.mode === 'video'"><span>Monitor sound</span>
              <label class="sw-row"><input type="checkbox" v-model="exp.monitor"> hear while recording</label>
            </div>
            <div class="x-row" v-if="exp.mode !== 'frames'"><span>Bitrate</span>
              <select v-model.number="exp.bitrate"><option :value="8">8 Mbps — small</option><option :value="16">16 Mbps — balanced</option><option :value="32">32 Mbps — pristine</option></select>
            </div>
            <div class="x-row" v-if="exp.mode !== 'gif'"><span>Frame rate</span>
              <select v-model.number="exp.fps"><option :value="24">24 fps</option><option :value="30">30 fps</option><option :value="60">60 fps</option></select>
            </div>
            <template v-if="exp.mode === 'gif'">
              <div class="x-row"><span>GIF size</span>
                <select v-model.number="gif.width"><option :value="240">240 px wide — chat</option><option :value="360">360 px — messages</option><option :value="480">480 px — social</option><option :value="640">640 px — large</option></select>
              </div>
              <div class="x-row"><span>GIF frame rate</span>
                <select v-model.number="gif.fps"><option :value="8">8 fps — small file</option><option :value="12">12 fps</option><option :value="15">15 fps</option><option :value="20">20 fps — smooth</option></select>
              </div>
            </template>
            <p class="hint" v-if="exp.mode === 'video'">Records in real time with your browser's native encoder — WebM in Firefox, MP4 (H.264) in Chrome where supported.</p>
            <p class="hint" v-else-if="exp.mode === 'mp4'">Encodes frame-by-frame with WebCodecs — faster than real time, every frame exact, and audio-reactivity is precomputed from the track's spectrum. Falls back to VP9/WebM if H.264 is unavailable.</p>
            <p class="hint" v-else-if="exp.mode === 'frames'">Exports every frame as a PNG into a single .zip — audio-reactive, perfect for editors and gifs. Keep fps modest; frames add up quickly.</p>
            <p class="hint" v-else>Audio-reactive animated GIF, encoded right here — perfect for socials, DMs and Spotify-Canvas-style loops. Lower size/fps to keep files friendly.</p>
            <button v-if="exp.mode === 'video'" class="btn primary big wide" @click="startExport"><span v-html="U.icon('export', 15)"></span>Start recording</button>
            <button v-else-if="exp.mode === 'mp4'" class="btn primary big wide" :disabled="!canOffline" @click="startOffline"><span v-html="U.icon('export', 15)"></span>Encode offline</button>
            <button v-else-if="exp.mode === 'frames'" class="btn primary big wide" @click="startFrames"><span v-html="U.icon('camera', 15)"></span>Export frames</button>
            <button v-else class="btn primary big wide" :disabled="!canAudio" @click="startGif"><span v-html="U.icon('export', 15)"></span>Export GIF</button>
          </template>
          <template v-else>
            <div class="x-prog"><div class="x-bar" :style="{ width: (S.expProg * 100).toFixed(1) + '%' }"></div></div>
            <div class="x-lab"><span class="mono">{{ S.expLabel }}</span><span class="mono">{{ Math.round(S.expProg * 100) }}%</span></div>
            <button class="btn danger big wide" @click="cancelExport">Cancel</button>
          </template>
        </template>

        <!-- CROP -->
        <template v-else-if="M.type === 'crop'">
          <div class="m-h"><h3>Crop — {{ cropLayer?.name }}</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <p class="hint">Drag on the image to draw the crop window. The layer then draws only what's inside it.</p>
          <canvas ref="cropCv" class="cropcv" @pointerdown="cropDown"></canvas>
          <div class="crop-lab mono lab">window: {{ (cropRect.w * 100).toFixed(1) }}% × {{ (cropRect.h * 100).toFixed(1) }}% at ({{ (cropRect.x * 100).toFixed(1) }}%, {{ (cropRect.y * 100).toFixed(1) }}%)</div>
          <div class="m-foot">
            <button class="btn small" @click="resetCrop">Reset</button>
            <div class="spacer"></div>
            <button class="btn small" @click="closeModal()">Cancel</button>
            <button class="btn small primary" @click="applyCrop"><span v-html="U.icon('check', 12)"></span>Apply</button>
          </div>
        </template>

        <!-- HELP -->
        <!-- GLOBAL VARIABLES -->
        <template v-else-if="M.type === 'globals'">
          <div class="m-h"><h3>Global variables</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <p class="modal-note">Project-wide knobs: set a value once, use it everywhere. Reference them by name in any <b>ƒ math automation</b> (<code>intensity * bass</code>) and in shaders as <code>uG_name</code>. Change one value, everything follows.</p>
          <div class="gv-row" v-for="(g, i) in gvars" :key="i">
            <input class="tin gv-n" v-model="g.name" @change="saveVars" spellcheck="false" placeholder="name">
            <input class="tin gv-v mono" v-model="g.value" @change="saveVars" spellcheck="false" placeholder="0">
            <button class="ib danger" @click="delVar(i)" v-html="U.icon('trash', 13)"></button>
          </div>
          <div class="btn-row end">
            <button class="btn" @click="addVar"><span v-html="U.icon('plus', 12)"></span>Add variable</button>
          </div>
          <p class="hint">Names must be valid identifiers (letters, digits, _). Values are numbers.</p>
        </template>

        <!-- REACTIVITY MIXER -->
        <template v-else-if="M.type === 'reactivity'">
          <div class="m-h"><h3>Audio reactivity</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <p class="modal-note">Global multipliers on the analysed audio — every reactive layer, automation, shader and the beat detector feels them. Tame a muddy mix, or push a quiet track harder.</p>
          <div class="ctl" v-for="k in ['bass', 'mid', 'treble', 'level', 'beat']" :key="k">
            <span class="ctl-l">{{ k === 'level' ? 'level (all)' : k }}</span>
            <span class="ctl-v">
              <input type="range" min="0" max="2" step="0.05" :value="rx[k]" @input="setRx(k, $event)">
              <b class="mono rxv">{{ rx[k].toFixed(2) }}×</b>
            </span>
          </div>
          <p class="hint">Beat gain also scales how hard beat-detection hits — above 1× fires more easily.</p>
          <div class="btn-row end"><button class="btn" @click="resetRx">Reset to 1.00×</button></div>
        </template>

        <template v-else-if="M.type === 'help'">
          <div class="m-h"><h3>Help & shortcuts</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <div class="help-cols">
            <div>
              <h4>Playback</h4>
              <div class="sc"><span>Space</span> play / pause</div>
              <div class="sc"><span>L</span> loop on / off</div>
              <div class="sc"><span>M</span> live microphone mode</div>
              <h4>Editing</h4>
              <div class="sc"><span>Ctrl+Z / +Shift</span> undo / redo</div>
              <div class="sc"><span>Ctrl+D</span> duplicate layer</div>
              <div class="sc"><span>Ctrl+C / X / V</span> copy / cut / paste at playhead</div>
              <div class="sc"><span>S</span> split layer at playhead</div>
              <div class="sc"><span>Delete</span> remove layer</div>
              <div class="sc"><span>Arrows</span> nudge (Shift = 10×)</div>
              <div class="sc"><span>Dbl-click name</span> rename</div>
            </div>
            <div>
              <h4>View & output</h4>
              <div class="sc"><span>F</span> fullscreen preview</div>
              <div class="sc"><span>P</span> save frame as PNG</div>
              <div class="sc"><span>E</span> export video</div>
              <div class="sc"><span>T</span> templates</div>
              <div class="sc"><span>R</span> audio reactivity mixer</div>
              <div class="sc"><span>G</span> global variables</div>
              <div class="sc"><span>Click</span> select layers on the canvas</div>
              <div class="sc"><span>F3</span> performance overlay</div>
              <div class="sc"><span>Ctrl+click</span> multi-select layers</div>
              <div class="sc"><span>Ctrl+scroll</span> zoom the stage</div>
              <div class="sc"><span>?</span> this dialog</div>
              <h4>Good to know</h4>
              <p class="hint">Drop audio, images, video, LRC/TTML lyrics, Lottie .json, font files (.ttf/.otf/.woff) or .vlx projects anywhere. <b>ƒ</b> beside a slider binds it to the music — try <code>beat</code>, <code>bass*2</code> or <code>an('Analyzer 1')</code> (analyzers, effects, automations, media, projects and lyrics live in the tabs on the left). Timeline clips drag to move, edges trim; right-click them for actions. Every slider edit is undoable. The <b>Media</b> tab keeps images, videos and fonts reusable across projects; the <b>Composition</b> tree exposes every layer's effects and automations.</p>
            </div>
          </div>
        </template>

        <!-- LYRICS -->
        <template v-else-if="M.type === 'lyrics'">
          <div class="m-h"><h3>Lyrics — {{ lyrLayer?.name }}</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <p class="hint">One line per lyric, timestamps as <code>[mm:ss.cc]</code>. Press <b>Stamp time</b> (or click in the text first) to drop the playhead time at the cursor while the music plays. Untimed lines inherit the previous line's rhythm.</p>
          <textarea ref="lyrTa" class="lyr mono" v-model="lyrText" spellcheck="false"
                    placeholder="[00:12.50] first line&#10;[00:16.10] second line"></textarea>
          <div class="m-foot">
            <label class="btn small">
              <span v-html="U.icon('folder', 12)"></span>Import LRC/TTML
              <input type="file" accept=".lrc,.ttml,.txt" class="hide" @change="importLyrics">
            </label>
            <div class="spacer"></div>
            <button class="btn small" @click="tapSync"><span v-html="U.icon('clockIcon', 12)"></span>Stamp {{ fmtTime(S.time).slice(0, 8) }}</button>
            <button class="btn small primary" @click="saveLyrics"><span v-html="U.icon('check', 13)"></span>Save</button>
          </div>
        </template>

        <!-- AUTOMATION -->
        <template v-else-if="M.type === 'auto'">
          <div class="m-h"><h3>Automate “{{ M.key }}”</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <p class="hint">An expression added to the base value every frame. Try <code>beat*0.3</code>, <code>bass</code>, <code>sin(t*2)*0.2</code>, <code>fft(80,200)</code>, <code>an('Analyzer 1')</code>. Empty removes the automation.</p>
          <div class="auto-v3">
            <label>Expression</label>
            <input class="tin mono big-in" v-model="autoExpr" placeholder="e.g. beat*0.3" autofocus @keydown.enter="saveAuto">
            <p class="hint auto-err" v-if="autoExpr.trim()">{{ autoErr }}</p>
            <div class="a3-row">
              <label>Enabled</label>
              <input type="checkbox" v-model="autoEnabledV">
            </div>
            <div class="a3-row">
              <label>Min value</label><input class="numin mono" type="number" step="0.05" v-model="autoMin" placeholder="—">
              <label>Max value</label><input class="numin mono" type="number" step="0.05" v-model="autoMax" placeholder="—">
              <label>Smoothing</label><input class="numin mono" type="number" step="0.05" min="0" max="0.95" v-model="autoSmooth" placeholder="—">
            </div>
          </div>
          <div class="m-foot"><button class="btn primary" @click="saveAuto">Apply</button></div>
        </template>

        <!-- CUSTOM SIZE -->
        <template v-else-if="M.type === 'customsize'">
          <div class="m-h"><h3>Custom canvas size</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <div class="cs-presets">
            <button v-for="p in CS_PRESETS" :key="p[2]" class="btn small" @click="cs.w = +p[0]; cs.h = +p[1]">{{ p[2] }}</button>
          </div>
          <div class="x-row"><span>Width</span><input class="numin mono" type="number" v-model.number="cs.w" min="16" max="7680"></div>
          <div class="x-row"><span>Height</span><input class="numin mono" type="number" v-model.number="cs.h" min="16" max="4320"></div>
          <div class="m-foot"><button class="btn primary" @click="applySize">Apply</button></div>
        </template>

        <!-- CONFIRM / PROMPT -->
        <template v-else-if="M.type === 'confirm'">
          <p class="c-msg">{{ M.msg }}</p>
          <div class="m-foot">
            <button class="btn" @click="closeModal(false)">Cancel</button>
            <button class="btn danger" @click="confirmYes">{{ M.yesLabel || 'Confirm' }}</button>
          </div>
        </template>
        <template v-else-if="M.type === 'prompt'">
          <p class="c-msg">{{ M.msg }}</p>
          <input class="tin" v-model="promptVal" autofocus @keydown.enter="promptOk">
          <div class="m-foot">
            <button class="btn" @click="closeModal(false)">Cancel</button>
            <button class="btn primary" @click="promptOk">OK</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-wrap { position: fixed; inset: 0; background: rgba(4, 5, 8, .72); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal {
  background: var(--bg2); border: 1px solid var(--line2); border-radius: 12px;
  width: min(92vw, 720px); max-height: 86vh; overflow-y: auto; padding: 18px 20px;
}
.m-welcome { width: min(92vw, 520px); text-align: center; padding: 34px 30px; }
.m-auto, .m-confirm, .m-prompt, .m-customsize { width: min(92vw, 440px); }
.m-export { width: min(92vw, 520px); }
.m-h { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.m-h h3 { font-size: 16px; font-weight: 700; flex: 1; }
.m-foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.spacer { flex: 1; }

.w-hero h2 { font-size: 26px; font-weight: 800; letter-spacing: -.01em; margin: 12px 0 6px; }
.w-sub { color: var(--ink3); font-size: 13px; line-height: 1.6; max-width: 360px; margin: 0 auto 22px; }
.w-actions { display: flex; flex-direction: column; gap: 9px; }
.w-hint { color: var(--ink3); font-size: 11.5px; margin-top: 20px; }
.w-hint b { color: var(--acc); }

.tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.tpl {
  display: flex; flex-direction: column; gap: 3px; text-align: left; cursor: pointer;
  background: var(--panel); border: 1px solid var(--line); border-radius: 9px; padding: 9px;
  color: var(--ink2); font-family: inherit;
}
.tpl:hover { border-color: var(--acc); }
.tpl-art { height: 60px; border-radius: 6px; background: linear-gradient(160deg, #14161c, #0c0d12); margin-bottom: 5px; display: flex; align-items: flex-end; justify-content: center; padding: 8px; }
.tpl-bars { display: flex; align-items: flex-end; gap: 3px; height: 100%; }
.tpl-bars i { width: 5px; background: rgba(34, 211, 238, .5); border-radius: 2px; animation: bar 1.1s ease-in-out infinite; }
.tpl-bars i:nth-child(1) { height: 40%; animation-delay: 0s; }
.tpl-bars i:nth-child(2) { height: 70%; animation-delay: .15s; }
.tpl-bars i:nth-child(3) { height: 100%; animation-delay: .3s; }
.tpl-bars i:nth-child(4) { height: 60%; animation-delay: .45s; }
.tpl-bars i:nth-child(5) { height: 35%; animation-delay: .6s; }
@keyframes bar { 50% { transform: scaleY(.45); } }
.tpl-name { font-weight: 700; font-size: 12.5px; color: var(--ink); }
.tpl-desc { font-size: 11px; color: var(--ink3); line-height: 1.4; min-height: 30px; }
.tpl-n { color: var(--ink3); }

.proj-new { display: flex; gap: 8px; margin-bottom: 12px; }
.proj-new .tin { flex: 1; min-width: 0; }
.proj-list { display: flex; flex-direction: column; gap: 4px; }
.proj { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
.proj-n { font-weight: 600; font-size: 12.5px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { color: var(--ink3); font-size: 12px; padding: 14px 4px; }
.hint { font-size: 11.5px; color: var(--ink3); line-height: 1.65; margin-bottom: 10px; }
.hint code { font-family: 'IBM Plex Mono', monospace; color: var(--data); font-size: 10.5px; }
.hint b { color: var(--acc); }

.x-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 12.5px; color: var(--ink2); gap: 10px; }
.x-modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 7px; margin-bottom: 12px; }
.rxv { min-width: 44px; text-align: right; color: var(--ink2); font-size: 11px; }
.gv-row { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.gv-n { width: 140px; }
.gv-v { width: 110px; }
.tpl { position: relative; }
.tpl-del {
  position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--ink3); background: rgba(10, 11, 14, .7); cursor: pointer;
}
.tpl-del:hover { color: var(--err); }
.tpl.mine { border-color: rgba(124, 108, 240, .5); }
.tpl.mine .tpl-name::after { content: ' ★'; color: var(--acc-ink); font-size: 10px; }
.x-modes button {
  display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
  padding: 8px 10px; cursor: pointer; color: var(--ink2); font-family: inherit; text-align: left;
}
.x-modes button b { font-size: 12.5px; color: var(--ink); }
.x-modes button span { font-size: 10px; color: var(--ink3); }
.x-modes button:hover:not(:disabled) { border-color: var(--line2); }
.x-modes button.on { border-color: var(--acc); background: rgba(124, 108, 240, .1); }
.x-modes button.on b { color: var(--acc-ink); }
.x-modes button:disabled { opacity: .45; cursor: not-allowed; }
.cropcv { width: 100%; max-width: 460px; aspect-ratio: 460 / 320; border: 1px solid var(--line2); border-radius: 8px; cursor: crosshair; touch-action: none; display: block; margin: 0 auto; background: var(--bg); }
.crop-lab { text-align: center; margin-top: 8px; }
.sw-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink3); cursor: pointer; }
.x-prog { height: 8px; background: var(--panel2); border-radius: 5px; overflow: hidden; margin: 18px 0 8px; }
.x-bar { height: 100%; background: var(--acc); transition: width .2s; }
.x-lab { display: flex; justify-content: space-between; color: var(--ink3); font-size: 11.5px; margin-bottom: 16px; }
.wide { width: 100%; }
.big { padding: 10px 16px; font-size: 13px; }

.help-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.help-cols h4 { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink3); margin: 14px 0 8px; }
.sc { display: flex; gap: 10px; align-items: baseline; font-size: 12px; color: var(--ink2); margin-bottom: 6px; }
.sc span { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: var(--ink); background: var(--panel2); border: 1px solid var(--line2); border-radius: 4px; padding: 1px 6px; white-space: nowrap; }

.lyr { width: 100%; min-height: 300px; resize: vertical; font-size: 12px; line-height: 1.8; white-space: pre; }
.hide { display: none; }
.big-in { font-size: 13px; padding: 8px 10px; }
.auto-err { margin: 8px 0 0; }
.c-msg { font-size: 13px; color: var(--ink2); line-height: 1.6; }
.cs-presets { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }

</style>
