<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { S, closeMenu, closeModal, toast, openModal } from './store.js';
import { handleDrop, copyLayer, cutLayer, pasteLayer, splitLayerAt } from './appctl.js';
import { U } from '../engine/util.js';
import TopBar from './components/TopBar.vue';
import LayerPanel from './components/LayerPanel.vue';
import Stage from './components/Stage.vue';
import Transport from './components/Transport.vue';
import Inspector from './components/Inspector.vue';
import Timeline from './components/Timeline.vue';
import Modals from './components/Modals.vue';

const dragging = ref(false);
let dragN = 0;

/* timeline collapse is pure CSS (body class retunes --h-tl for .app and the toasts) */
watch(() => S.ui.tl, v => document.body.classList.toggle('tl-closed', !v), { immediate: true });

function toggleDrawer(side) {
  S.ui[side] = !S.ui[side];
  S.ui[side === 'left' ? 'right' : 'left'] = false;
}

const menuStyle = computed(() => {
  if (!S.menu) return {};
  return {
    left: Math.max(6, Math.min(S.menu.x, window.innerWidth - 350)) + 'px',
    top: Math.max(6, Math.min(S.menu.y, window.innerHeight - 420)) + 'px',
  };
});

function onKey(e) {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') {
    closeModal(); closeMenu();
    S.ui.left = S.ui.right = false;
    if (S.multi.length) { S.multi = []; S.rev++; }
    if (document.fullscreenElement) document.exitFullscreen();
    return;
  }
  if (typing) return;
  const VX = S.vx;
  if (!VX) return;
  const meta = e.ctrlKey || e.metaKey;
  if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? VX.project.redo() : VX.project.undo(); return; }
  if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); VX.project.redo(); return; }
  if (meta && e.key.toLowerCase() === 'd') { e.preventDefault(); if (S.sel) dupLayer(); return; }
  if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); VX.project.saveNow(); toast('Project saved'); return; }
  if (meta && e.key.toLowerCase() === 'c') { e.preventDefault(); if (S.sel) copyLayer(VX.project.current.layers.find(x => x.id === S.sel)); return; }
  if (meta && e.key.toLowerCase() === 'x') { e.preventDefault(); if (S.sel) cutLayer(VX.project.current.layers.find(x => x.id === S.sel)); return; }
  if (meta && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteLayer(); return; }
  if (S.exporting) return;
  switch (e.key) {
    case ' ': e.preventDefault(); VX.audio.engine.resume().then(() => VX.app.togglePlay()); break;
    case 'Delete': case 'Backspace': if (S.multi.length > 1) { e.preventDefault(); delMulti(); } else if (S.sel) { e.preventDefault(); delLayer(); } break;
    case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
      const l = VX.project.current.layers.find(x => x.id === S.sel); if (!l) break; e.preventDefault();
      const d = e.shiftKey ? .05 : .005;
      if (e.key === 'ArrowUp') l.y -= d; if (e.key === 'ArrowDown') l.y += d;
      if (e.key === 'ArrowLeft') l.x -= d; if (e.key === 'ArrowRight') l.x += d;
      break;
    }
    case 'f': case 'F': document.getElementById('stage')?.requestFullscreen?.(); break;
    case 'F3': e.preventDefault(); S.perf = !S.perf; break;
    case 'p': case 'P': VX.exporter.snapshotPNG(); break;
    case 'e': case 'E': openModal('export'); break;
    case 't': case 'T': openModal('templates'); break;
    case 'm': case 'M': toggleMic(); break;
    case 'l': case 'L': VX.app.loop = !VX.app.loop; VX.audio.engine.setLoop(VX.app.loop); toast(VX.app.loop ? 'Loop on' : 'Loop off'); break;
    case 's': case 'S': {
      const l = VX.project.current.layers.find(x => x.id === S.sel);
      if (l && splitLayerAt(l, S.time)) toast('Layer split at playhead');
      else if (l) toast('Playhead is outside this layer', 'warn');
      break;
    }
    case 'r': case 'R': openModal('reactivity'); break;
    case 'g': case 'G': openModal('globals'); break;
    case '?': openModal('help'); break;
  }
}
function dupLayer() {
  const VX = S.vx;
  const arr = VX.project.current.layers;
  const i = arr.findIndex(l => l.id === S.sel); if (i < 0) return;
  const copy = JSON.parse(JSON.stringify(arr[i], (k, v) => (k.startsWith('_') && k !== '_seed') ? undefined : v));
  copy.id = U.uid(); copy.name += ' copy';
  arr.splice(i + 1, 0, copy);
  VX.project.snapshot('duplicate layer');
  S.sel = copy.id;
  S.rev++;
}
function delMulti() {
  const VX = S.vx;
  const arr = VX.project.current.layers;
  const n = S.multi.length;
  for (const id of S.multi) {
    const i = arr.findIndex(l => l.id === id);
    if (i >= 0) arr.splice(i, 1);
  }
  S.multi = []; S.sel = null;
  VX.project.snapshot('delete layers');
  S.rev++;
  toast(`Deleted ${n} layers`);
}
function delLayer() {
  const VX = S.vx;
  const arr = VX.project.current.layers;
  const i = arr.findIndex(l => l.id === S.sel); if (i < 0) return;
  const name = arr[i].name;
  arr.splice(i, 1);
  S.sel = null;
  VX.project.snapshot('delete layer');
  S.rev++;
  toast(`Deleted “${name}”`);
}
async function toggleMic() {
  const VX = S.vx;
  if (VX.app.micOn) { VX.audio.engine.disableMic(); VX.app.micOn = false; toast('Microphone off'); }
  else { VX.app.micOn = await VX.audio.engine.enableMic(); if (VX.app.micOn) toast('Live mic — visuals react to your microphone'); }
}

function onDragEnter(e) { e.preventDefault(); if (++dragN === 1) dragging.value = true; }
function onDragLeave(e) { e.preventDefault(); if (--dragN <= 0) { dragN = 0; dragging.value = false; } }
function onDrop(e) {
  e.preventDefault(); dragN = 0; dragging.value = false;
  for (const f of e.dataTransfer.files) handleDrop(f);
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  document.addEventListener('dragenter', onDragEnter);
  document.addEventListener('dragleave', onDragLeave);
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', onDrop);
  window.addEventListener('error', (e) => { toast('⚠ ' + (e.message || 'Script error'), 'err'); });
  if (!localStorage.getItem('vlexyna_welcomed_v2')) {
    localStorage.setItem('vlexyna_welcomed_v2', '1');
    setTimeout(() => openModal('welcome'), 300);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('dragenter', onDragEnter);
  document.removeEventListener('dragleave', onDragLeave);
  document.removeEventListener('drop', onDrop);
});
</script>

<template>
  <div class="app">
    <TopBar />
    <LayerPanel />
    <div class="center-col">
      <Stage />
      <Transport />
    </div>
    <Inspector />
    <Timeline />
  </div>

  <!-- narrow-viewport drawers -->
  <Teleport to="body">
    <div v-if="S.ui.left || S.ui.right" class="drawer-scrim" @click="toggleDrawer(S.ui.left ? 'left' : 'right')"></div>
  </Teleport>

  <!-- context menu -->
  <Teleport to="body">
    <div v-if="S.menu" class="menu" :class="{ wide: S.menu.wide }" :style="menuStyle">
      <template v-for="(it, i) in S.menu.items" :key="i">
        <div v-if="it.sep" class="menu-sep lab">{{ it.sep }}</div>
        <button v-else class="menu-item" :class="{ danger: it.danger }" @click="closeMenu(); it.fn && it.fn()">
          <span v-html="U.icon(it.ic || 'shape', 14)"></span>
          <span class="mi-l">{{ it.label }}</span>
          <span v-if="it.hint" class="mi-hint">{{ it.hint }}</span>
        </button>
      </template>
    </div>

    <Modals />
    <div class="toasts">
      <div v-for="t in S.toasts" :key="t.id" class="toast" :class="t.kind">{{ t.msg }}</div>
    </div>
    <div v-if="dragging" class="dropzone"><div>Drop audio, images, video, lyrics or .vlx projects</div></div>
  </Teleport>
</template>

<style scoped>
.center-col { grid-area: center; display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #07080b; }
</style>
