<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { S, openModal } from '../store.js';
import { loadDemo, loadAudioFile } from '../appctl.js';
import { U } from '../../engine/util.js';

const isTweaked = computed(() => {
  const g = S.vx?.audio?.engine?.gains;
  return !!g && Object.values(g).some(v => Math.abs(v - 1) > .01);
});
const beatStyle = computed(() => ({
  opacity: 0.22 + S.bands.beat * 0.78,
  transform: `scale(${1 + S.bands.beat * .9})`,
}));

function seek(e) {
  const v = +e.target.value / 1000;
  S.vx.app.seekTo(v * S.dur);
}
function togglePlay() { S.vx.audio.engine.resume().then(() => S.vx.app.togglePlay()); }
function toggleLoop() { S.vx.app.loop = !S.vx.app.loop; S.vx.audio.engine.setLoop(S.vx.app.loop); }
function setRate(e) { S.vx.audio.engine.setRate(+e.target.value); }
function onVolWheel(e) {
  e.preventDefault();
  const cur = S.audio.vol * 100;
  const next = Math.max(0, Math.min(100, cur + (e.deltaY < 0 ? 5 : -5)));
  S.audio.vol = next / 100;
  S.vx.audio.engine.setVolume(next / 100);
}
const tagLine = computed(() => {
  const t = S.vx?.audio?.engine?.tags || {};
  const parts = [];
  if (t.title) parts.push(t.title);
  if (t.artist) parts.push(t.artist);
  return parts.join(' — ');
});
function setVol(e) {
  const v = +e.target.value / 100;
  S.vx.audio.engine.setVolume(v);
  if (!S.vx.app.muted) S.audio.vol = v;
}
function toggleMute() {
  S.vx.app.muted = !S.vx.app.muted;
  S.vx.audio.engine.setVolume(S.vx.app.muted ? 0 : S.audio.vol * 100 / 100);
}
async function toggleMic() {
  if (S.vx.app.micOn) { S.vx.audio.engine.disableMic(); S.vx.app.micOn = false; }
  else S.vx.app.micOn = await S.vx.audio.engine.enableMic();
}
function pickAudio() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'audio/*';
  inp.onchange = () => { if (inp.files[0]) loadAudioFile(inp.files[0]); };
  inp.click();
}

/* ── the signature element: a live mini-spectrum of the actual audio ── */
const spec = ref(null);
let raf = 0;
function drawSpec() {
  const c = spec.value;
  if (c && S.vx) {
    const eng = S.vx.audio.engine;
    const x = c.getContext('2d');
    /* resize only when the element actually changed size — reallocating the
       canvas every frame was a serious, constant layout/perf drain */
    const w = Math.max(2, Math.round(c.clientWidth * 2)), h = Math.max(2, Math.round(c.clientHeight * 2));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    x.clearRect(0, 0, w, h);
    if (eng.freq && eng.freq.length) {
      const n = 48;
      for (let i = 0; i < n; i++) {
        /* log-spaced bins like the spectrum layer */
        const f0 = 30 * Math.pow(14000 / 30, i / n), f1 = 30 * Math.pow(14000 / 30, (i + 1) / n);
        const v = Math.pow(eng.range(f0, f1), .8);
        const bh = Math.max(2, v * h);
        x.fillStyle = `rgba(34, 211, 238, ${.35 + v * .65})`;
        x.fillRect((i / n) * w, (h - bh) / 2, w / n - 3, bh);
      }
    }
  }
  raf = requestAnimationFrame(drawSpec);
}
onMounted(() => { raf = requestAnimationFrame(drawSpec); });
onBeforeUnmount(() => cancelAnimationFrame(raf));

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), cs = Math.floor((s % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};
</script>

<template>
  <div class="transport">
    <button class="play" @click="togglePlay" :title="S.playing ? 'Pause (Space)' : 'Play (Space)'" v-html="U.icon(S.playing ? 'pause' : 'play', 18)"></button>
    <span class="t mono">{{ fmt(S.time) }}</span>
    <input class="seek" type="range" min="0" max="1000" step="1"
           :value="Math.max(0, Math.min(1000, S.dur ? S.time / S.dur * 1000 : 0))"
           @input="seek" @change="scrubbing = false" title="Seek">
    <span class="t mono">{{ fmt(S.dur) }}</span>
    <span class="beat" :style="beatStyle"></span>
    <canvas ref="spec" class="spec" title="Live spectrum"></canvas>

    <button class="ib" :class="{ on: S.vx?.app?.loop }" @click="toggleLoop" title="Loop (L)" v-html="U.icon('loop')"></button>
    <div class="vol">
      <button class="ib" @click="toggleMute" :title="S.audio.muted ? 'Unmute' : 'Mute monitor'" v-html="U.icon(S.audio.muted ? 'volumeOff' : 'volume')"></button>
      <input type="range" min="0" max="100" :value="S.audio.vol * 100" @input="setVol" @wheel="onVolWheel" title="Monitor volume — scroll to adjust">
    </div>
    <button class="ib" :class="{ on: isTweaked }" @click="openModal('reactivity')" title="Audio reactivity mixer (R)" v-html="U.icon('bars')"></button>
    <button class="ib" :class="{ on: S.audio.micOn }" @click="toggleMic" title="Live microphone mode (M)" v-html="U.icon('mic')"></button>

    <div class="audio">
      <button class="btn small" @click="loadDemo" title="Synthesize a demo track in your browser"><span v-html="U.icon('spark', 12)"></span>Demo beat</button>
      <button class="btn small" @click="pickAudio"><span v-html="U.icon('music', 12)"></span>Load audio</button>
      <select class="speed" :value="String(S.vx?.audio?.engine?.rate ?? 1)" @change="setRate" title="Playback speed — nightcore / slowed">
        <option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option>
      </select>
      <span class="aname" :title="S.audio.name">{{ tagLine || S.audio.name || 'no audio' }}</span>
    </div>
  </div>
</template>

<style scoped>
.transport {
  display: flex; align-items: center; gap: 10px; padding: 7px 14px;
  background: var(--panel); border-top: 1px solid var(--line); flex-wrap: wrap;
}
.play {
  width: 38px; height: 38px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--acc); color: #fff; display: inline-flex; align-items: center; justify-content: center;
  transition: transform .12s;
}
.play:hover { transform: scale(1.06); }
.t { color: var(--ink2); font-size: 11.5px; min-width: 74px; text-align: center; }
.seek { flex: 1; min-width: 120px; }
.beat { width: 8px; height: 8px; border-radius: 50%; background: var(--data); flex-shrink: 0; transition: transform .05s; }
.spec { width: 96px; height: 26px; flex-shrink: 0; }
.vol { display: flex; align-items: center; gap: 2px; }
.vol input { width: 70px; }
.audio { display: flex; align-items: center; gap: 7px; min-width: 0; }
.aname { color: var(--ink3); font-size: 11.5px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.speed { padding: 3px 4px; font-size: 11px; }
</style>
