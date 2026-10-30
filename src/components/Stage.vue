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
      perfLine.value = `${(1000 / avg).toFixed(0)} fps · ${avg.toFixed(1)} ms/frame · ${layers} layers · ${S.width}×${S.height} · zoom ${S.zoom ? Math.round(S.zoom * 100) + '%' : 'fit'}`;
      perfAcc = 0; perfN = 0;
    }
  }
  lastT = now;
  requestAnimationFrame(perfTick);
}

/* stage zoom lives in the store (S.zoom) — the transport strip and Ctrl+scroll drive it */
const ZOOMS = [0, .25, .5, 1, 2];
function zoomStep(dir) {
  const i = ZOOMS.indexOf(S.zoom);
  S.zoom = ZOOMS[U.clamp((i < 0 ? 0 : i) + dir, 0, ZOOMS.length - 1)];
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
  if (S.zoom > 0) {
    w = Math.round((S.width || 1920) * S.zoom);
    h = Math.round((S.height || 1080) * S.zoom);
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
watch(() => S.zoom, (z) => { if (S.vx) S.vx.app.zoom = z > 0 ? z : 1; fit(); });

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
    S.vx.renderer && S.vx.renderer.invalidate();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    S.vx.project.snapshot(mode === 'rot' ? 'rotate layer' : 'scale layer');
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

/* ── click-to-select: pixel hit-test the layers under the cursor ──
   Each candidate layer is drawn alone to a small offscreen canvas and the
   alpha under the click point decides. Stateful / GL layers fall back to a
   bounding-circle estimate. Cheapest possible: only on click, low res. */
const HIT_SKIP = new Set(['shader', 'butterchurn', 'lottie']);
let hitCv = null;
function pickLayer(px, py) {
  const VX = S.vx, proj = VX.project.current;
  if (!proj) return null;
  const W = cv.value.width, H = cv.value.height;
  const sc = Math.min(1, 480 / Math.max(W, H));          /* hit canvas scale */
  const hw = Math.max(2, Math.round(W * sc)), hh = Math.max(2, Math.round(H * sc));
  if (!hitCv) hitCv = document.createElement('canvas');
  hitCv.width = hw; hitCv.height = hh;
  const hx = hitCv.getContext('2d');
  const cx = U.clamp(px * sc, 0, hw - 1), cy = U.clamp(py * sc, 0, hh - 1);
  const a = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0, beatCount: 0, wave: VX.audio.engine.wave || new Float32Array(64) };
  for (let i = proj.layers.length - 1; i >= 0; i--) {
    const l = proj.layers[i];
    if (!VX.renderer.layerVisible(l, VX.app.time)) continue;
    const def = VX.layers.byId[l.type];
    if (!def) continue;
    if (HIT_SKIP.has(l.type)) {
      /* fallback: circle around the anchor sized by scale */
      const rr = .36 * Math.min(W, H) * (l.scale || 1);
      if (Math.hypot((px - l.x) * W, (py - l.y) * H) <= rr) return l;
      continue;
    }
    try {
      hx.setTransform(1, 0, 0, 1, 0, 0);
      hx.globalAlpha = 1; hx.globalCompositeOperation = 'source-over'; hx.filter = 'none';
      hx.clearRect(0, 0, hw, hh);
      hx.save();
      if (!def.noTransform) {
        hx.translate(l.x * hw, l.y * hh);
        hx.rotate((l.rotation || 0) * Math.PI / 180);
        hx.scale(l.scale || 1, l.scale || 1);
      }
      def.draw(hx, {
        W: hw, H: hh, t: VX.app.time, dt: 0, a, p: l.props, layer: l, env: {},
        playing: false, time: VX.app.time, duration: VX.app.duration(), project: proj,
        alpha: 1, layerLocal: VX.app.time - (l.start || 0), frameBefore: null,
      });
      hx.restore();
      const d = hx.getImageData(cx, cy, 1, 1).data;
      if (d[3] > 12) return l;
    } catch (e) { /* layer that can't draw offscreen — skip it */ }
  }
  return null;
}

/* drag to move the selected layer (click first selects what is under the cursor) */
let drag = null;
function onDown(e) {
  if (S.exporting || e.button !== 0) return;
  const r = cv.value.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  let l = selL.value;
  const hit = pickLayer(px, py);
  if (!hit) {                                   /* clicked empty space → deselect */
    if (l || S.multi.length) { S.sel = null; S.multi = []; }
    return;
  }
  if (hit !== l) { S.sel = hit.id; S.multi = []; l = hit; }
  if (l.locked) return;
  drag = {
    x0: px, y0: py,
    lx: l.x, ly: l.y,
  };
  const move = (ev) => {
    if (!drag) return;
    l.x = U.clamp(drag.lx + ((ev.clientX - r.left) / r.width - drag.x0), -.5, 1.5);
    l.y = U.clamp(drag.ly + ((ev.clientY - r.top) / r.height - drag.y0), -.5, 1.5);
    S.vx.renderer && S.vx.renderer.invalidate();
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
    <div id="exportBadge" v-if="S.exporting">● RECORDING</div>
    <div class="stage-hint lab" v-if="S.booted && !S.audio.has && !S.exporting">no audio — demo beat or drop a file</div>
    <div class="pick-hint lab" v-if="!S.sel && S.booted && !S.exporting">click a layer to select it · drag to move</div>
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
.pick-hint { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); pointer-events: none; opacity: .8; }
#stage:fullscreen { background: #000; }
#stage:fullscreen #stageInner { outline: none; }
</style>
