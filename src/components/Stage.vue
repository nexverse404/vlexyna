<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { S } from '../store.js';
import { boot } from '../appctl.js';
import { U } from '../../engine/util.js';

const stage = ref(null), inner = ref(null), cv = ref(null);
let fw = 0, fh = 0;

/* F3 performance overlay — frame pacing measured locally */
const perfLine = ref('');
let lastT = 0, perfAcc = 0, perfN = 0;
function perfTick(now) {
  if (S.perf) {
    const dt = lastT ? now - lastT : 16;
    perfAcc += dt; perfN++;
    if (perfN >= 20) {
      const avg = perfAcc / perfN;
      const layers = S.vx?.project?.current?.layers?.length || 0;
      perfLine.value = `${(1000 / avg).toFixed(0)} fps · ${avg.toFixed(1)} ms/frame · ${layers} layers · ${S.width}×${S.height} · zoom ${zoomLabel.value}`;
      perfAcc = 0; perfN = 0;
    }
  }
  lastT = now;
  requestAnimationFrame(perfTick);
}

/* stage zoom: 0 = fit-to-view, otherwise a scale factor on project pixels */
const ZOOMS = [0, .25, .5, 1, 2];
const zoom = ref(0);
const zoomLabel = computed(() => zoom.value ? Math.round(zoom.value * 100) + '%' : 'Fit');
function zoomStep(dir) {
  const i = ZOOMS.indexOf(zoom.value);
  zoom.value = ZOOMS[U.clamp((i < 0 ? 0 : i) + dir, 0, ZOOMS.length - 1)];
}
function onWheel(e) {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoomStep(e.deltaY < 0 ? 1 : -1);
}

const selL = computed(() => {
  S.rev;
  return S.vx?.project?.current ? (S.vx.project.current.layers.find(l => l.id === S.sel) || null) : null;
});

function fit() {
  if (!stage.value || !inner.value || !S.vx) return;
  let w, h;
  if (zoom.value > 0) {
    w = Math.round((S.width || 1920) * zoom.value);
    h = Math.round((S.height || 1080) * zoom.value);
  } else {
    const sw = Math.max(60, stage.value.clientWidth - 24);
    const sh = Math.max(40, stage.value.clientHeight - 24);
    const ar = (S.width || 16) / (S.height || 9);
    w = sw; h = w / ar;
    if (h > sh) { h = sh; w = h * ar; }
    w = Math.round(w); h = Math.round(h);
  }
  if (fw !== w || fh !== h) {
    fw = w; fh = h;
    inner.value.style.width = w + 'px';
    inner.value.style.height = h + 'px';
  }
}
watch(zoom, () => fit());

let ro = null;
onMounted(async () => {
  requestAnimationFrame(perfTick);
  await boot(cv.value);
  fit();
  ro = new ResizeObserver(fit);
  ro.observe(stage.value);
  window.addEventListener('resize', fit);
});
onBeforeUnmount(() => { ro?.disconnect(); window.removeEventListener('resize', fit); });

/* can this layer be scaled/rotated? (backgrounds etc. cannot) */
const hasTransform = computed(() => {
  const l = selL.value;
  return !!l && !(S.vx?.layers?.byId?.[l.type]?.noTransform);
});

/* ── transform gizmo: rotate + scale around the layer anchor ── */
function handleDown(e, mode) {
  const l = selL.value;
  if (!l || l.locked || S.exporting) return;
  e.stopPropagation(); e.preventDefault();
  const r = cv.value.getBoundingClientRect();
  const cx = r.left + l.x * r.width, cy = r.top + l.y * r.height;
  const start = {
    rot: l.rotation || 0, scale: l.scale || 1,
    ang: Math.atan2(e.clientY - cy, e.clientX - cx),
    dist: Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)),
  };
  const move = (ev) => {
    if (mode === 'rot') {
      let d = (Math.atan2(ev.clientY - cy, ev.clientX - cx) - start.ang) * 180 / Math.PI;
      l.rotation = Math.round((start.rot + d) * 10) / 10;
    } else {
      const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      l.scale = U.clamp(Math.round(start.scale * d / start.dist * 100) / 100, .05, 30);
    }
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    S.vx.project.snapshot(mode === 'rot' ? 'rotate layer' : 'scale layer');
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

/* drag to move the selected layer */
let drag = null;
function onDown(e) {
  const l = selL.value;
  if (!l || l.locked || S.exporting) return;
  const r = cv.value.getBoundingClientRect();
  drag = {
    x0: (e.clientX - r.left) / r.width, y0: (e.clientY - r.top) / r.height,
    lx: l.x, ly: l.y,
  };
  const move = (ev) => {
    if (!drag) return;
    l.x = U.clamp(drag.lx + ((ev.clientX - r.left) / r.width - drag.x0), 0, 1);
    l.y = U.clamp(drag.ly + ((ev.clientY - r.top) / r.height - drag.y0), 0, 1);
  };
  const up = () => {
    drag = null;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    S.vx.project.snapshot('move layer');
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}
</script>

<template>
  <main id="stage" ref="stage" @wheel="onWheel">
    <div id="stageInner" ref="inner">
      <canvas id="preview" ref="cv" @pointerdown="onDown"></canvas>
      <div class="gizmo" v-if="selL && !S.exporting"
           :style="{ left: (selL.x * 100) + '%', top: (selL.y * 100) + '%' }">
        <span class="anchor-dot" title="Drag the canvas to move"></span>
        <template v-if="hasTransform">
          <span class="giz-arm giz-arm-v"></span>
          <span class="giz-r" @pointerdown="handleDown($event, 'rot')" title="Rotate"></span>
          <span class="giz-arm giz-arm-d"></span>
          <span class="giz-s" @pointerdown="handleDown($event, 'scale')" title="Scale"></span>
          <span class="giz-info mono">{{ Math.round(selL.rotation || 0) }}° · {{ (selL.scale || 1).toFixed(2) }}×</span>
        </template>
      </div>
    </div>
    <div class="perf mono" v-if="S.perf && !S.exporting">{{ perfLine }}</div>
    <div class="zoombar" v-if="!S.exporting">
      <button class="ib tiny" @click="zoomStep(-1)" title="Zoom out">−</button>
      <button class="ib tiny zoom-cur" @click="zoom = 0" title="Fit to view">{{ zoomLabel }}</button>
      <button class="ib tiny" @click="zoomStep(1)" title="Zoom in (Ctrl+scroll)">+</button>
    </div>
    <div id="exportBadge" v-if="S.exporting">● RECORDING</div>
    <div class="stage-hint lab" v-if="S.booted && !S.audio.has && !S.exporting">no audio — demo beat or drop a file</div>
  </main>
</template>

<style scoped>
#stage {
  position: relative; display: flex;
  flex: 1; min-width: 0; min-height: 0; overflow: auto;
  background: repeating-conic-gradient(#0a0c11 0% 25%, #080a0e 0% 50%) 0 0 / 26px 26px;
}
#stageInner { position: relative; outline: 1px solid var(--line2); background: #000; margin: auto; }
#preview { display: block; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
.anchor { position: absolute; pointer-events: none; }
.anchor-dot {
  position: absolute; width: 7px; height: 7px; border-radius: 50%;
  background: var(--data); transform: translate(-50%, -50%);
  box-shadow: 0 0 0 3px rgba(34, 211, 238, .18);
}
/* transform gizmo — rotate (top) + scale (bottom-right) around the anchor */
.gizmo { position: absolute; pointer-events: none; }
.giz-r, .giz-s {
  position: absolute; width: 11px; height: 11px; border-radius: 3px;
  border: 1.5px solid var(--data); background: #06222a;
  pointer-events: auto; cursor: grab; transform: translate(-50%, -50%);
}
.giz-r { left: 0; top: -40px; cursor: alias; border-radius: 50%; }
.giz-s { left: 34px; top: 34px; }
.giz-r:hover, .giz-s:hover { background: var(--data); }
.giz-arm { position: absolute; background: rgba(34, 211, 238, .45); pointer-events: none; }
.giz-arm-v { width: 1px; height: 34px; left: -.5px; top: -37px; }
.giz-arm-d { width: 36px; height: 1px; left: 17px; top: 17px; transform: rotate(45deg); transform-origin: 0 50%; }
.giz-info {
  position: absolute; left: 14px; top: -34px; white-space: nowrap;
  font-size: 10px; color: var(--ink2); background: rgba(8, 10, 14, .8);
  padding: 1px 6px; border-radius: 4px; border: 1px solid var(--line2);
}
.perf {
  position: absolute; left: 12px; bottom: 10px; z-index: 6; pointer-events: none;
  font-size: 10.5px; color: #9fe8c8; background: rgba(6, 12, 10, .8);
  border: 1px solid rgba(62, 207, 142, .3); border-radius: 6px; padding: 3px 9px;
}
.zoombar {
  position: absolute; right: 12px; bottom: 10px; z-index: 6;
  display: flex; align-items: center; gap: 1px;
  background: rgba(10, 12, 17, .82); border: 1px solid var(--line2); border-radius: 8px; padding: 2px;
}
.zoombar .ib.tiny { width: 22px; height: 22px; }
.zoombar .zoom-cur { width: auto; min-width: 40px; padding: 0 6px; font-size: 10.5px; }
#exportBadge {
  position: absolute; top: 12px; left: 12px;
  color: #ffb3bf; border: 1px solid rgba(255, 77, 106, .5);
  padding: 4px 11px; border-radius: 18px; font-size: 10.5px; font-weight: 600;
  letter-spacing: .14em; animation: blink 1.2s ease-in-out infinite;
}
@keyframes blink { 50% { opacity: .45; } }
.stage-hint { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); pointer-events: none; }
#stage:fullscreen { background: #000; }
#stage:fullscreen #stageInner { outline: none; }
</style>
