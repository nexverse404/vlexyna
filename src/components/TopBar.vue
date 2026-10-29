<script setup>
import { computed } from 'vue';
import { S, openModal, toast, confirmDlg } from '../store.js';
import { syncAll } from '../store.js';
import { U } from '../../engine/util.js';

const sizes = [
  ['1920x1080', '1920 × 1080 · 16:9'],
  ['1280x720', '1280 × 720 · 16:9'],
  ['2560x1440', '2560 × 1440 · QHD'],
  ['3840x2160', '3840 × 2160 · 4K'],
  ['7680x4320', '7680 × 4320 · 8K'],
  ['1080x1920', '1080 × 1920 · 9:16'],
  ['1080x1080', '1080 × 1080 · 1:1'],
  ['1080x1350', '1080 × 1350 · 4:5'],
  ['custom', 'Custom…'],
];
const quals = [[360, 'Preview 360p'], [480, 'Preview 480p'], [720, 'Preview 720p'], [1080, 'Preview 1080p'], [0, 'Preview full']];

const sizeVal = computed({
  get() {
    const cur = `${S.width}x${S.height}`;
    return sizes.some(s => s[0] === cur) ? cur : 'custom';
  },
  set(v) {
    if (v === 'custom') { openModal('customsize'); return; }
    const [w, h] = v.split('x').map(Number);
    const VX = S.vx;
    VX.project.current.width = w; VX.project.current.height = h;
    VX.project.snapshot('canvas size');
    syncAll();
  },
});
const nameModel = computed({
  get: () => S.name,
  set: (v) => { S.vx.project.current.name = v || 'Untitled'; S.vx.project.autosave(); },
});
function undo() { S.vx.project.undo(); }
function redo() { S.vx.project.redo(); }
function snapshot() { S.vx.exporter.snapshotPNG(); }
function pickVlx() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.vlx,application/json';
  inp.onchange = async () => { if (inp.files[0]) { await S.vx.project.importFile(inp.files[0]); syncAll(); } };
  inp.click();
}
function exportVlx() { S.vx.project.exportFile(); }
function newProject() {
  confirmDlg('Start a new empty project? Your current project stays saved in the list.', () => {
    S.vx.project.newProject('Untitled');
    S.sel = null;
    syncAll();
  }, 'New project');
}
</script>

<template>
  <header class="bar">
    <div class="brand" title="Vlexyna Studio">
      <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
        <defs><linearGradient id="blg" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#7c5cff"/>
        </linearGradient></defs>
        <path d="M5 26V14M11 26V6M17 26v-11M23 26V10M28 26v-7" stroke="url(#blg)" stroke-width="3" stroke-linecap="round" fill="none"/>
      </svg>
      <span class="brand-t">Vlexyna</span>
    </div>

    <div class="divider"></div>
    <input class="pname" v-model="nameModel" spellcheck="false" title="Project name" @change="S.vx.project.snapshot('rename')">
    <span class="saved" :class="{ on: Date.now() - S.savedFlash < 1200 }" title="Autosaved to this browser">●</span>

    <button class="ib only-narrow" :class="{ on: S.ui.left }" @click="S.ui.left = !S.ui.left; S.ui.right = false" title="Layers panel" v-html="U.icon('layers')"></button>
    <button class="ib only-narrow" :class="{ on: S.ui.right }" @click="S.ui.right = !S.ui.right; S.ui.left = false" title="Inspector panel" v-html="U.icon('settings')"></button>

    <div class="divider"></div>
    <select v-model="sizeVal" title="Canvas size">
      <option v-for="s in sizes" :key="s[0]" :value="s[0]">{{ s[1] }}</option>
    </select>
    <select :value="String(S.fpsProj)" @change="S.vx.project.current.fps = +$event.target.value; S.vx.project.snapshot('fps'); S.fpsProj = +$event.target.value" title="Frame rate">
      <option value="24">24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option>
    </select>
    <select class="only-wide" :value="String(S.vx?.app.previewQuality ?? 720)" @change="S.vx.app.previewQuality = +$event.target.value; S.vx.renderer.invalidate()" title="Preview quality — lower renders faster">
      <option v-for="q in quals" :key="q[0]" :value="String(q[0])">{{ q[1] }}</option>
    </select>

    <div class="divider"></div>
    <button class="ib" :disabled="!S.canUndo" @click="undo" title="Undo (Ctrl+Z)" v-html="U.icon('undo')"></button>
    <button class="ib" :disabled="!S.canRedo" @click="redo" title="Redo (Ctrl+Shift+Z)" v-html="U.icon('redo')"></button>

    <div class="spacer"></div>
    <span class="fps mono only-wide" v-if="S.fps">{{ S.fps }} fps</span>

    <button class="btn" @click="openModal('templates')" title="Templates (T)"><span v-html="U.icon('template', 13)"></span><span class="bt-txt">Templates</span></button>
    <button class="btn" @click="openModal('projects')" title="Projects"><span v-html="U.icon('folder', 13)"></span><span class="bt-txt">Projects</span></button>
    <button class="btn" @click="openModal('media')" title="Media library — stock images, your uploads, fonts"><span v-html="U.icon('media', 13)"></span><span class="bt-txt">Media</span></button>
    <button class="btn" @click="snapshot" title="Save frame as PNG (P)"><span v-html="U.icon('camera', 13)"></span><span class="bt-txt">Frame</span></button>
    <button class="ib" @click="document.getElementById('stage')?.requestFullscreen?.()" title="Fullscreen (F)" v-html="U.icon('fullscreen')"></button>
    <button class="ib" @click="openModal('help')" title="Help & shortcuts (?)" v-html="U.icon('help')"></button>
    <button class="btn primary" @click="openModal('export')" title="Export video (E)"><span v-html="U.icon('export', 13)"></span><span class="bt-txt">Export</span></button>
  </header>
</template>

<style scoped>
.bar {
  grid-area: top;
  display: flex; align-items: center; flex-wrap: wrap; column-gap: 9px; row-gap: 4px;
  min-height: var(--h-top); padding: 4px 12px;
  background: var(--bg2); border-bottom: 1px solid var(--line);
}
.brand { display: flex; align-items: center; gap: 8px; }
.brand-t { font-weight: 700; font-size: 14px; letter-spacing: .02em; }
.divider { width: 1px; height: 20px; background: var(--line); }
.spacer { flex: 1; }
.pname {
  background: transparent; border: 1px solid transparent; border-radius: 6px;
  padding: 4px 8px; width: 130px; font-weight: 600; color: var(--ink);
}
.pname:hover { border-color: var(--line2); }
.pname:focus { outline: none; border-color: var(--acc); background: var(--panel); }
.saved { color: var(--ok); font-size: 8px; opacity: 0; transition: opacity .4s; }
.saved.on { opacity: 1; }
.fps { color: var(--ink3); font-size: 11px; }
.bar select { max-width: 150px; }
@media (max-width: 1024px) {
  .pname { width: 104px; }
  .bar select { max-width: 118px; }
}
@media (max-width: 880px) {
  .pname { width: 92px; }
  .divider { display: none; }
}
@media (max-width: 560px) {
  .brand-t { display: none; }
  .pname { width: 84px; }
}
</style>
