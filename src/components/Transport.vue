<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { S, openModal, toast, touch } from '../store.js';
import { loadDemo, loadAudioFile, handleDrop } from '../appctl.js';
import { U } from '../../engine/util.js';

/* ── resolution pills — vizzy's 360/480/720/1080 strip ── */
const RES = [[360, '360'], [480, '480'], [720, '720'], [1080, '1080']];
const setRes = (q) => { S.vx.app.previewQuality = q; S.vx.renderer.invalidate(); };

/* ── stage zoom, shared with the stage through the store ── */
const ZOOMS = [0, .25, .5, 1, 2];
const zoomLabel = computed(() => S.zoom ? Math.round(S.zoom * 100) + '%' : 'Fit');
function zoomStep(dir) {
  const i = ZOOMS.indexOf(S.zoom);
  S.zoom = ZOOMS[U.clamp((i < 0 ? 0 : i) + dir, 0, ZOOMS.length - 1)];
}

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
function stop() { S.vx.app.pause(); S.vx.app.seekTo(0); }
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
  if (!S.audio.muted) S.audio.vol = v;
}
function toggleMute() {
  S.vx.app.muted = !S.vx.app.muted;
  S.vx.audio.engine.setVolume(S.vx.app.muted ? 0 : S.audio.vol);
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
/* quick-add: video / image become layers instantly */
function pickQuick(kind) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = kind === 'video' ? 'video/*' : 'image/*';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (f) await handleDrop(f);
  };
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
    const w = Math.max(2, Math.round(c.clientWidth * 2)), h = Math.max(2, Math.round(c.clientHeight * 2));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    x.clearRect(0, 0, w, h);
    if (eng.freq && eng.freq.length) {
      const n = 48;
      for (let i = 0; i < n; i++) {
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
    <div class="t-row">
      <div class="resgrp">
        <button v-for="r in RES" :key="r[0]" class="resbtn" :class="{ on: (S.vx?.app?.previewQuality ?? 720) === r[0] }"
                @click="setRes(r[0])" :title="r[1] + 'p preview quality'">{{ r[1] }}</button>
      </div>

      <button class="play" @click="togglePlay" :title="S.playing ? 'Pause (Space)' : 'Play (Space)'" v-html="U.icon(S.playing ? 'pause' : 'play', 16)"></button>
      <button class="ib" @click="stop" title="Stop — back to 0" v-html="U.icon('stop', 13)"></button>

      <div class="zoomctl">
        <button class="ib tiny" @click="zoomStep(-1)" title="Zoom out">−</button>
        <span class="lab mono">Zoom: {{ zoomLabel }}</span>
        <button class="ib tiny" @click="zoomStep(1)" title="Zoom in">+</button>
      </div>

      <span class="t mono">{{ fmt(S.time) }} / {{ fmt(S.dur) }}</span>
      <span class="beat" :style="beatStyle"></span>
      <canvas ref="spec" class="spec" title="Live spectrum"></canvas>

      <span class="aname" :title="S.audio.name">{{ tagLine || S.audio.name || 'no audio' }}</span>

      <div class="spacer"></div>

      <button class="qadd" @click="pickAudio" title="Attach an audio file to the project"><span v-html="U.icon('music', 11)"></span>Choose audio</button>
      <button class="qadd" @click="pickQuick('video')" title="Add a video layer"><span v-html="U.icon('video', 11)"></span>Video</button>
      <button class="qadd" @click="pickQuick('image')" title="Add an image layer"><span v-html="U.icon('image', 11)"></span>Image</button>
    </div>

    <div class="t-row sub">
      <button class="ib" :class="{ on: S.vx?.app?.loop }" @click="toggleLoop" title="Loop (L)" v-html="U.icon('loop', 14)"></button>
      <div class="vol">
        <button class="ib" @click="toggleMute" :title="S.audio.muted ? 'Unmute' : 'Mute monitor'" v-html="U.icon(S.audio.muted ? 'volumeOff' : 'volume', 14)"></button>
        <input type="range" min="0" max="100" :value="S.audio.vol * 100" @input="setVol" @wheel="onVolWheel" title="Monitor volume — scroll to adjust">
      </div>
      <button class="ib" :class="{ on: isTweaked }" @click="openModal('reactivity')" title="Audio reactivity mixer (R)" v-html="U.icon('bars', 14)"></button>
      <button class="ib" :class="{ on: S.audio.micOn }" @click="toggleMic" title="Live microphone mode (M)" v-html="U.icon('mic', 14)"></button>
      <select class="speed" :value="String(S.vx?.audio?.engine?.rate ?? 1)" @change="setRate" title="Playback speed — nightcore / slowed">
        <option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option>
      </select>
      <span class="lab only-wide">speed</span>
      <button class="btn small only-wide" @click="loadDemo" title="Synthesize a demo track in your browser"><span v-html="U.icon('spark', 11)"></span>Demo beat</button>
      <div class="spacer"></div>
      <span class="lab mono only-wide" v-if="S.fps">{{ S.fps }} fps</span>
    </div>
  </div>
</template>

<style scoped>
.transport {
  display: flex; flex-direction: column;
  background: var(--panel); border-top: 1px solid var(--line);
}
.t-row { display: flex; align-items: center; gap: 9px; padding: 6px 12px; flex-wrap: wrap; }
.t-row.sub { border-top: 1px solid var(--line); padding: 4px 12px; background: var(--bg2); }
.resgrp { display: flex; gap: 2px; }
.play {
  width: 32px; height: 32px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--acc); color: #fff; display: inline-flex; align-items: center; justify-content: center;
  transition: transform .12s;
}
.play:hover { transform: scale(1.06); }
.zoomctl { display: flex; align-items: center; gap: 2px; }
.zoomctl .lab { min-width: 58px; text-align: center; }
.t { color: var(--ink2); font-size: 11.5px; white-space: nowrap; }
.beat { width: 8px; height: 8px; border-radius: 50%; background: var(--data); flex-shrink: 0; transition: transform .05s; }
.spec { width: 88px; height: 24px; flex-shrink: 0; }
.aname { color: var(--ink3); font-size: 11.5px; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vol { display: flex; align-items: center; gap: 2px; }
.vol input { width: 66px; }
.spacer { flex: 1; }
.speed { padding: 3px 4px; font-size: 11px; }
@media (max-width: 880px) { .spec { display: none; } }
</style>
