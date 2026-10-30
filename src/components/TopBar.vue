<script setup>
import { S, openModal, openMenu, toast, confirmDlg, promptDlg, syncAll } from '../store.js';
import { U } from '../../engine/util.js';
import { copyLayer, cutLayer, pasteLayer, splitLayerAt } from '../appctl.js';

/* ── the ribbon: File · Edit · Project · View · Help — vizzy-style menus ── */
function pickVlx() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.vlx,application/json';
  inp.onchange = async () => { if (inp.files[0]) { await S.vx.project.importFile(inp.files[0]); syncAll(); } };
  inp.click();
}
function renameProject() {
  promptDlg('Project name', S.name, (v) => {
    if (!v?.trim()) return;
    S.vx.project.current.name = v.trim();
    S.vx.project.snapshot('rename');
    syncAll();
  });
}
function menuFile(e) {
  openMenu(e, [
    { label: 'New project…', ic: 'plus', fn: () => confirmDlg('Start a new empty project? Your current project stays saved in the list.', () => { S.vx.project.newProject('Untitled'); S.sel = null; syncAll(); }, 'New project') },
    { label: 'Open project…', ic: 'folder', fn: () => { S.tab = 'projects'; } },
    { label: 'Import .vlx…', ic: 'save', fn: pickVlx },
    { label: 'Export .vlx…', ic: 'export', fn: () => S.vx.project.exportFile() },
    { sep: '' },
    { label: 'Rename project…', ic: 'edit', fn: renameProject },
    { label: 'Export video…', ic: 'export', hint: 'E', fn: () => openModal('export') },
    { label: 'Save frame as PNG', ic: 'camera', hint: 'P', fn: () => S.vx.exporter.snapshotPNG() },
  ]);
}
function selLayer() { return S.vx.project.current.layers.find(l => l.id === S.sel) || null; }
function menuEdit(e) {
  const VX = S.vx;
  openMenu(e, [
    { label: 'Undo', ic: 'undo', hint: 'Ctrl+Z', fn: () => VX.project.undo() },
    { label: 'Redo', ic: 'redo', hint: 'Ctrl+Shift+Z', fn: () => VX.project.redo() },
    { sep: '' },
    { label: 'Copy', ic: 'copy', hint: 'Ctrl+C', fn: () => copyLayer(selLayer()) },
    { label: 'Cut', ic: 'copy', hint: 'Ctrl+X', fn: () => cutLayer(selLayer()) },
    { label: 'Paste at playhead', ic: 'copy', hint: 'Ctrl+V', fn: () => pasteLayer() },
    { label: 'Duplicate', ic: 'copy', hint: 'Ctrl+D', fn: () => { const l = selLayer(); if (l) { copyLayer(l); pasteLayer(); } } },
    { sep: '' },
    { label: 'Split at playhead', ic: 'clock', hint: 'S', fn: () => { const l = selLayer(); if (l && splitLayerAt(l, S.time)) toast('Layer split at playhead'); else toast('Playhead is outside this layer', 'warn'); } },
    { label: 'Delete', ic: 'trash', hint: 'Del', danger: true, fn: () => { const l = selLayer(); if (l) { VX.project.current.layers.splice(VX.project.current.layers.findIndex(x => x.id === l.id), 1); S.sel = null; VX.project.snapshot('delete layer'); syncAll(); } } },
  ]);
}
function menuProject(e) {
  openMenu(e, [
    { label: 'Explore creations…', ic: 'template', fn: () => openModal('templates') },
    { label: 'Publish / share project', ic: 'export', fn: () => { S.vx.project.exportFile(); toast('Project exported as .vlx — publish it anywhere'); } },
    { label: 'Screenshot thumbnail', ic: 'camera', fn: () => S.vx.exporter.snapshotPNG() },
    { label: 'Custom resolution…', ic: 'grid', fn: () => openModal('customsize') },
    { sep: '' },
    { label: 'Audio analyzers', ic: 'activity', fn: () => { S.tab = 'analyzers'; } },
    { label: 'Automations', ic: 'zap', fn: () => { S.tab = 'automations'; } },
    { label: 'Global variables', ic: 'gauge', hint: 'G', fn: () => openModal('globals') },
    { label: 'Reactivity mixer', ic: 'sliders', hint: 'R', fn: () => openModal('reactivity') },
  ]);
}
function menuView(e) {
  openMenu(e, [
    { label: 'Layers panel', ic: 'layers', fn: () => { S.ui.left = !S.ui.left; S.ui.right = false; } },
    { label: 'Inspector panel', ic: 'settings', fn: () => { S.ui.right = !S.ui.right; S.ui.left = false; } },
    { label: 'Toggle timeline', ic: 'list', fn: () => S.ui.tl = !S.ui.tl },
    { sep: '' },
    { label: 'Fullscreen preview', ic: 'fullscreen', hint: 'F', fn: () => document.getElementById('stage')?.requestFullscreen?.() },
    { label: 'Performance overlay', ic: 'gauge', hint: 'F3', fn: () => S.perf = !S.perf },
    { sep: 'Preview quality' },
    { label: '360p', fn: () => { S.vx.app.previewQuality = 360; S.vx.renderer.invalidate(); } },
    { label: '480p', fn: () => { S.vx.app.previewQuality = 480; S.vx.renderer.invalidate(); } },
    { label: '720p', fn: () => { S.vx.app.previewQuality = 720; S.vx.renderer.invalidate(); } },
    { label: '1080p', fn: () => { S.vx.app.previewQuality = 1080; S.vx.renderer.invalidate(); } },
    { label: 'Full resolution', fn: () => { S.vx.app.previewQuality = 0; S.vx.renderer.invalidate(); } },
  ]);
}
function menuHelp(e) {
  openMenu(e, [
    { label: 'Keyboard shortcuts', ic: 'help', hint: '?', fn: () => openModal('help') },
    { label: 'About Vlexyna', ic: 'logo', fn: () => openModal('welcome') },
  ]);
}
</script>

<template>
  <header class="bar vz-ribbon">
    <div class="vz-logo" title="Vlexyna Studio">
      <svg viewBox="0 0 32 32" width="19" height="19" aria-hidden="true">
        <defs><linearGradient id="blg" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#8f7fe8"/><stop offset="1" stop-color="#4b32c8"/>
        </linearGradient></defs>
        <path d="M5 26V14M11 26V6M17 26v-11M23 26V10M28 26v-7" stroke="url(#blg)" stroke-width="3" stroke-linecap="round" fill="none"/>
      </svg>
      <b>Vlexyna</b>
    </div>

    <button class="vz-menu" @click="menuFile">File</button>
    <button class="vz-menu" @click="menuEdit">Edit</button>
    <button class="vz-menu" @click="menuProject">Project</button>
    <button class="vz-menu" @click="menuView">View</button>
    <button class="vz-menu" @click="menuHelp">Help</button>

    <button class="ib only-narrow" :class="{ on: S.ui.left }" @click="S.ui.left = !S.ui.left; S.ui.right = false" title="Layers panel" v-html="U.icon('layers')"></button>
    <button class="ib only-narrow" :class="{ on: S.ui.right }" @click="S.ui.right = !S.ui.right; S.ui.left = false" title="Inspector panel" v-html="U.icon('settings')"></button>

    <div class="spacer"></div>
    <span class="fps mono only-wide" v-if="S.fps">{{ S.fps }} fps</span>
    <span class="vz-pill">v{{ S.vx?.version || '3.1' }}</span>
    <span class="saved" :class="{ on: Date.now() - S.savedFlash < 1200 }" title="Autosaved to this browser">●</span>
    <span class="lab only-wide" v-if="Date.now() - S.savedFlash < 1200">Saved</span>

    <button class="btn" @click="openModal('templates')" title="Explore creations — templates (T)"><span v-html="U.icon('template', 13)"></span><span class="bt-txt">Explore creations</span></button>
    <button class="btn" @click="S.vx.project.exportFile(); toast('Project exported as .vlx')" title="Export the project as a shareable .vlx file"><span v-html="U.icon('save', 13)"></span><span class="bt-txt">Share project</span></button>
    <button class="btn primary" @click="openModal('export')" title="Export video (E)"><span v-html="U.icon('export', 13)"></span><span class="bt-txt">Export</span></button>
  </header>
</template>

<style scoped>
.bar { grid-area: top; }
.saved { color: var(--ok); font-size: 8px; opacity: 0; transition: opacity .4s; }
.saved.on { opacity: 1; }
.fps { color: var(--ink3); font-size: 11px; }
@media (max-width: 880px) { .vz-logo b { display: none; } }
</style>
