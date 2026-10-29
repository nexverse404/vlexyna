<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { S, openMenu, toast } from '../store.js';
import { U } from '../../engine/util.js';

const ZOOMS = [2, 4, 8, 16, 24, 40, 64, 100];
const zi = ref(3);
const snap = ref(true);
const scroll = ref(null);
const ruler = ref(null);
const wave = ref(null);

const pps = computed(() => ZOOMS[zi.value]); /* px per second */
const dur = computed(() => S.dur || 30);
const width = computed(() => Math.max(600, dur.value * pps.value + 40));

const layers = computed(() => { S.rev; const all = S.vx?.project?.current ? [...S.vx.project.current.layers].reverse() : []; return S.ui.showShy ? all : all.filter(l => !l.shy); });

function drawRuler() {
  const c = ruler.value; if (!c) return;
  const x = c.getContext('2d');
  const w = c.width = c.clientWidth * 2, h = c.height = c.clientHeight * 2;
  x.clearRect(0, 0, w, h);
  const dpr2 = 2;
  x.scale(dpr2, dpr2);
  const cw = w / dpr2;
  const step = pps.value < 8 ? 5 : pps.value < 24 ? 1 : pps.value < 64 ? .5 : .25;
  for (let t = 0; t <= dur.value; t += step) {
    const px = t * pps.value;
    if (px > cw + 20) break;
    const major = Math.abs(t % (step >= 1 ? 5 : 5 * step)) < .001;
    x.fillStyle = major ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.18)';
    x.fillRect(px, major ? 6 : 12, 1, major ? 12 : 6);
    if (major) {
      x.fillStyle = 'rgba(255,255,255,.45)';
      x.font = '9.5px "IBM Plex Mono", monospace';
      x.fillText(U.fmtTime(t).slice(0, 5), px + 4, 12);
    }
  }
}
function drawWave() {
  const c = wave.value; if (!c) return;
  const eng = S.vx?.audio?.engine;
  const x = c.getContext('2d');
  const w = c.width = c.clientWidth * 2, h = c.height = c.clientHeight * 2;
  x.clearRect(0, 0, w, h);
  if (!eng?.peaks) return;
  const peaks = eng.peaks;
  for (let i = 0; i < peaks.length; i++) {
    const px = (i / peaks.length) * w;
    const ph = Math.max(2, peaks[i] * h);
    x.fillStyle = peaks[i] > .5 ? 'rgba(34,211,238,.75)' : 'rgba(34,211,238,.38)';
    x.fillRect(px, (h - ph) / 2, Math.max(1.5, w / peaks.length - 1), ph);
  }
}

/* ruler seeks */
function rulerSeek(e) {
  const r = e.currentTarget.getBoundingClientRect();
  S.vx.app.seekTo(U.clamp((e.clientX - r.left) / pps.value, 0, dur.value));
  const move = (ev) => S.vx.app.seekTo(U.clamp((ev.clientX - r.left) / pps.value, 0, dur.value));
  const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
}
function laneSeek(e) {
  if (e.target !== e.currentTarget) return;
  const r = e.currentTarget.getBoundingClientRect();
  S.vx.app.seekTo(U.clamp((e.clientX - r.left) / pps.value, 0, dur.value));
}

function clipMenu(e, l) {
  e.preventDefault(); e.stopPropagation();
  S.sel = l.id;
  const VX = S.vx;
  openMenu(e, [
    { label: 'Duplicate', ic: 'copy', hint: 'Ctrl+D', fn: () => {
      const arr = VX.project.current.layers;
      const copy = JSON.parse(JSON.stringify(l, (k, v) => (k.startsWith('_') && k !== '_seed') ? undefined : v));
      copy.id = U.uid(); copy.name += ' copy';
      arr.splice(arr.indexOf(l) + 1, 0, copy);
      VX.project.snapshot('duplicate layer'); S.rev++;
    } },
    { label: 'Split at playhead', ic: 'clock', hint: 'S', fn: () => {
      const t = S.time;
      if (t <= (l.start || 0) + .01 || (l.end != null && t >= l.end - .01)) { toast('Playhead is outside this layer', 'warn'); return; }
      const b = JSON.parse(JSON.stringify(l, (k, v) => (k.startsWith('_') && k !== '_seed') ? undefined : v));
      b.id = U.uid(); b.name = l.name + ' B';
      l.end = t; b.start = t;
      const arr = VX.project.current.layers;
      arr.splice(arr.indexOf(l) + 1, 0, b);
      VX.project.snapshot('split layer'); S.rev++;
    } },
    { label: 'Go to start', ic: 'undo', fn: () => VX.app.seekTo(l.start || 0) },
    { sep: '' },
    { label: 'Delete', ic: 'trash', danger: true, hint: 'Del', fn: () => {
      const arr = VX.project.current.layers;
      arr.splice(arr.findIndex(x => x.id === l.id), 1);
      S.sel = null; VX.project.snapshot('delete layer'); S.rev++;
    } },
  ], { wide: true });
}

/* clip drag: move / trim */
function clipDown(e, l, mode) {
  if (S.exporting) return;
  e.stopPropagation(); e.preventDefault();
  S.sel = l.id;
  const px0 = e.clientX;
  const o = { start: l.start, end: l.end ?? dur.value };
  const sn = (v) => snap.value ? Math.round(v / .25) * .25 : v;
  const move = (ev) => {
    const dt = (ev.clientX - px0) / pps.value;
    if (mode === 'move') {
      const len = o.end - o.start;
      l.start = U.clamp(sn(o.start + dt), 0, Math.max(0, dur.value - len));
      l.end = l.start + len;
    } else if (mode === 'l') {
      l.start = U.clamp(sn(o.start + dt), 0, o.end - .05);
    } else {
      l.end = U.clamp(sn(o.end + dt), l.start + .05, dur.value + 120);
    }
    S.rev++;
  };
  const up = () => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    S.vx.project.snapshot(mode === 'move' ? 'move clip' : 'trim clip');
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
}

const playheadLeft = computed(() => S.time * pps.value + 'px');

let ro = null;
function redrawAll() { drawRuler(); drawWave(); }
watch(() => S.tlRev, () => nextTick(redrawAll));
watch(zi, () => nextTick(redrawAll));
onMounted(async () => {
  await nextTick();
  redrawAll();
  ro = new ResizeObserver(redrawAll);
  ro.observe(ruler.value?.parentElement || document.body);
});
onBeforeUnmount(() => { ro?.disconnect(); });
defineExpose({ redrawAll });
</script>

<template>
  <section class="tl">
    <div class="tl-side">
      <div class="tl-side-tools">
        <button class="ib tiny" @click="zi = Math.max(0, zi - 1); nextTick(redrawAll)" :disabled="zi === 0" title="Zoom out">−</button>
        <span class="lab">{{ pps }} px/s</span>
        <button class="ib tiny" @click="zi = Math.min(ZOOMS.length - 1, zi + 1); nextTick(redrawAll)" :disabled="zi === ZOOMS.length - 1" title="Zoom in">+</button>
        <button class="ib tiny" :class="{ on: snap }" @click="snap = !snap" title="Snap to ¼ s">⇥</button>
        <div class="spacer"></div>
        <button class="ib tiny" @click="S.ui.tl = !S.ui.tl" :title="S.ui.tl ? 'Collapse timeline' : 'Expand timeline'"
                v-html="U.icon(S.ui.tl ? 'down' : 'up', 13)"></button>
      </div>
      <div class="tl-audio-row">
        <span class="lab">audio</span>
      </div>
      <div class="tl-lname" v-for="l in layers" :key="'n' + l.id" :class="{ sel: S.sel === l.id }" @click="S.sel = l.id" :title="l.name">
        <span class="tn-dot" :class="l.type"></span>{{ l.name }}
      </div>
    </div>
    <div class="tl-scroll" ref="scroll">
      <div class="tl-content" :style="{ width: width + 'px' }">
        <canvas ref="ruler" class="tl-ruler" @pointerdown="rulerSeek"></canvas>
        <div class="tl-lane audio-lane" @pointerdown="laneSeek">
          <canvas ref="wave" class="tl-wave"></canvas>
          <span v-if="!S.audio.has" class="lab nolab">drop or load audio to see the waveform</span>
        </div>
        <div class="tl-lane" v-for="l in layers" :key="l.id" @pointerdown="laneSeek">
          <div class="clip" :class="{ sel: S.sel === l.id, off: !l.visible }"
               :style="{ left: ((l.start || 0) * pps) + 'px', width: Math.max(8, ((l.end ?? dur) - (l.start || 0)) * pps) + 'px' }"
               @pointerdown="clipDown($event, l, 'move')"
               @contextmenu="clipMenu($event, l)">
            <span class="clip-e l" @pointerdown.stop="clipDown($event, l, 'l')"></span>
            <span class="clip-n">{{ l.name }}</span>
            <span class="clip-e r" @pointerdown.stop="clipDown($event, l, 'r')"></span>
          </div>
        </div>
        <div class="playhead" :style="{ left: playheadLeft }"><span class="ph-tip"></span></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tl {
  grid-area: tl;
  display: grid; grid-template-columns: 250px 1fr; min-height: 0; overflow: hidden;
  background: var(--bg2); border-top: 1px solid var(--line);
}
.tl-side-tools .spacer { flex: 1; }
@media (max-width: 1220px) { .tl { grid-template-columns: 190px 1fr; } }
@media (max-width: 880px)  { .tl { grid-template-columns: 148px 1fr; } }
@media (max-width: 560px)  { .tl { grid-template-columns: 104px 1fr; } .tl-side-tools .lab { display: none; } }
.tl-side { border-right: 1px solid var(--line); display: flex; flex-direction: column; overflow: hidden; }
.tl-side-tools { display: flex; align-items: center; gap: 5px; padding: 4px 10px; height: 34px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.ib.tiny { width: 20px; height: 20px; font-size: 13px; }
.tl-audio-row { height: 30px; display: flex; align-items: center; padding: 0 10px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.tl-lname {
  height: 26px; display: flex; align-items: center; gap: 7px; padding: 0 10px;
  font-size: 11.5px; color: var(--ink2); cursor: pointer; border-bottom: 1px solid var(--line2);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex-shrink: 0;
}
.tl-lname.sel { color: var(--ink); background: var(--panel2); }
.tn-dot { width: 6px; height: 6px; border-radius: 2px; background: var(--ink3); flex-shrink: 0; }
.tl-lname.sel .tn-dot { background: var(--acc); }
.tl-scroll { overflow-x: auto; overflow-y: hidden; position: relative; }
.tl-content { position: relative; min-height: 100%; }
.tl-ruler { display: block; width: 100%; height: 34px; cursor: ew-resize; position: sticky; top: 0; z-index: 3; background: var(--bg2); }
.tl-lane {
  height: 30px; border-bottom: 1px solid var(--line2); position: relative;
  background-image: linear-gradient(90deg, var(--line2) 1px, transparent 1px);
  background-size: v-bind(pps + 'px') 100%;
}
.audio-lane { background-color: rgba(34, 211, 238, .025); }
.tl-wave { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.nolab { position: absolute; inset: 0; display: flex; align-items: center; padding-left: 10px; }
.clip {
  position: absolute; top: 4px; bottom: 4px; border-radius: 5px;
  background: var(--panel2); border: 1px solid var(--line2);
  display: flex; align-items: center; overflow: hidden; cursor: grab; touch-action: none;
  min-width: 8px;
}
.clip.sel { border-color: var(--acc); background: rgba(124, 108, 240, .14); }
.clip.off { opacity: .45; }
.clip-n { font-size: 10.5px; padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink2); pointer-events: none; }
.clip-e { position: absolute; top: 0; bottom: 0; width: 7px; cursor: ew-resize; }
.clip-e.l { left: 0; } .clip-e.r { right: 0; }
.clip-e:hover { background: var(--acc); }
.playhead { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--play); z-index: 5; pointer-events: none; }
.ph-tip { position: absolute; top: 0; left: -4px; border: 5px solid transparent; border-top-color: var(--play); }
</style>
