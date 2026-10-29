<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { S } from '../store.js';
import { boot } from '../appctl.js';
import { U } from '../../engine/util.js';

const stage = ref(null), inner = ref(null), cv = ref(null);
let fw = 0, fh = 0;

const selL = computed(() => {
  S.rev;
  return S.vx?.project?.current ? (S.vx.project.current.layers.find(l => l.id === S.sel) || null) : null;
});

function fit() {
  if (!stage.value || !inner.value || !S.vx) return;
  const sw = Math.max(60, stage.value.clientWidth - 24);
  const sh = Math.max(40, stage.value.clientHeight - 24);
  const ar = (S.width || 16) / (S.height || 9);
  let w = sw, h = w / ar;
  if (h > sh) { h = sh; w = h * ar; }
  w = Math.round(w); h = Math.round(h);
  if (fw !== w || fh !== h) {
    fw = w; fh = h;
    inner.value.style.width = w + 'px';
    inner.value.style.height = h + 'px';
  }
}

let ro = null;
onMounted(async () => {
  await boot(cv.value);
  fit();
  ro = new ResizeObserver(fit);
  ro.observe(stage.value);
  window.addEventListener('resize', fit);
});
onBeforeUnmount(() => { ro?.disconnect(); window.removeEventListener('resize', fit); });

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
  <main id="stage" ref="stage">
    <div id="stageInner" ref="inner">
      <canvas id="preview" ref="cv" @pointerdown="onDown"></canvas>
      <div class="anchor" v-if="selL && !S.exporting"
           :style="{ left: (selL.x * 100) + '%', top: (selL.y * 100) + '%' }">
        <span class="anchor-dot"></span>
      </div>
    </div>
    <div id="exportBadge" v-if="S.exporting">● RECORDING</div>
    <div class="stage-hint lab" v-if="S.booted && !S.audio.has && !S.exporting">no audio — demo beat or drop a file</div>
  </main>
</template>

<style scoped>
#stage {
  position: relative; display: flex; align-items: center; justify-content: center;
  flex: 1; min-width: 0; min-height: 0; overflow: hidden;
  background: repeating-conic-gradient(#0a0c11 0% 25%, #080a0e 0% 50%) 0 0 / 26px 26px;
}
#stageInner { position: relative; outline: 1px solid var(--line2); background: #000; }
#preview { display: block; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
.anchor { position: absolute; pointer-events: none; }
.anchor-dot {
  position: absolute; width: 7px; height: 7px; border-radius: 50%;
  background: var(--data); transform: translate(-50%, -50%);
  box-shadow: 0 0 0 3px rgba(34, 211, 238, .18);
}
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
