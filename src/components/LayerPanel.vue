<script setup>
import { computed, ref } from 'vue';
import { S, openMenu, toast } from '../store.js';
import { U } from '../../engine/util.js';

const renaming = ref(null);
const renameVal = ref('');

const layersRev = computed(() => {
  S.rev;
  return S.vx?.project?.current ? [...S.vx.project.current.layers].reverse() : [];
});

function select(id, ev) {
  if (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
    const i = S.multi.indexOf(id);
    if (i >= 0) S.multi.splice(i, 1); else S.multi.push(id);
    if (S.multi.length === 1) S.sel = id;
    return;
  }
  S.multi = [];
  S.sel = id === S.sel ? null : id;
}
const hasShy = computed(() => {
  S.rev;
  return !!(S.vx?.project?.current?.layers || []).some(l => l.shy);
});
const visibleLayers = computed(() => {
  S.rev;
  const all = S.vx?.project?.current ? [...S.vx.project.current.layers].reverse() : [];
  return S.ui.showShy ? all : all.filter(l => !l.shy);
});

function addLayer(type) {
  const VX = S.vx;
  const l = VX.layers.make(type);
  if (!l) return;
  VX.project.current.layers.push(l);
  VX.project.snapshot('add ' + type);
  S.sel = l.id;
  S.rev++;
  toast(`Added ${l.name}`);
}
function splitAtPlayhead(l) {
  const VX = S.vx;
  const t = S.time;
  if (t <= (l.start || 0) + .01 || (l.end != null && t >= l.end - .01)) { toast('Playhead is outside this layer', 'warn'); return; }
  const b = JSON.parse(JSON.stringify(l, (k, v) => (k.startsWith('_') && k !== '_seed') ? undefined : v));
  b.id = U.uid(); b.name = l.name + ' B';
  l.end = t; b.start = t;
  const arr = VX.project.current.layers;
  arr.splice(arr.indexOf(l) + 1, 0, b);
  VX.project.snapshot('split layer');
  S.rev++;
  toast('Layer split at playhead');
}

function addMenu(e) {
  const VX = S.vx;
  const cats = [];
  for (const def of VX.layers.list) {
    let c = cats.find(x => x.name === def.cat);
    if (!c) { c = { name: def.cat, items: [] }; cats.push(c); }
    c.items.push({ label: def.name, ic: def.icon, hint: def.desc, fn: () => addLayer(def.id) });
  }
  const order = ['Media', 'Visuals', 'Background', 'Text', 'Decor', 'Generators', 'Visualization', '3D', 'Utility'];
  cats.sort((a, b) => (order.indexOf(a.name) + 100) - (order.indexOf(b.name) + 100));
  openMenu(e, cats.flatMap(c => [{ sep: c.name }, ...c.items]), { wide: true });
}

function layerMenu(e, l) {
  const VX = S.vx;
  e.stopPropagation();
  S.sel = l.id;
  openMenu(e, [
    { label: 'Duplicate', ic: 'copy', hint: 'Ctrl+D', fn: () => { const arr = VX.project.current.layers; const copy = JSON.parse(JSON.stringify(l, (k, v) => (k.startsWith('_') && k !== '_seed') ? undefined : v)); copy.id = U.uid(); copy.name += ' copy'; arr.splice(arr.indexOf(l) + 1, 0, copy); VX.project.snapshot('duplicate layer'); S.sel = copy.id; S.rev++; } },
    { label: 'Rename…', ic: 'edit', fn: () => { renaming.value = l.id; renameVal.value = l.name; } },
    { sep: 'Timing' },
    { label: 'Split at playhead', ic: 'clock', fn: () => splitAtPlayhead(l) },
    { label: l.shy ? 'Unshy layer' : 'Shy layer (hide from list, keep rendering)', ic: 'eyeOff', fn: () => { l.shy = !l.shy; S.vx.project.autosave(); S.rev++; } },
    { sep: '' },
    { label: 'Delete', ic: 'trash', danger: true, hint: 'Del', fn: () => { VX.project.current.layers.splice(VX.project.current.layers.findIndex(x => x.id === l.id), 1); S.sel = null; VX.project.snapshot('delete layer'); S.rev++; } },
  ], { wide: true });
}

function commitRename(l) {
  if (renameVal.value.trim()) { l.name = renameVal.value.trim(); S.vx.project.snapshot('rename layer'); }
  renaming.value = null;
}

/* drag to reorder */
let dragId = null;
function onDragStart(e, l) { dragId = l.id; e.dataTransfer.effectAllowed = 'move'; }
function onDragOver(e, l) {
  if (dragId === null || l.id === dragId) return;
  e.preventDefault();
  const VX = S.vx;
  const arr = VX.project.current.layers;
  const from = arr.findIndex(x => x.id === dragId), to = arr.findIndex(x => x.id === l.id);
  if (from < 0 || to < 0) return;
  const moved = arr.splice(from, 1)[0];
  arr.splice(to, 0, moved);
  S.rev++;
}
function onDragEnd() { if (dragId !== null) { dragId = null; S.vx.project.snapshot('reorder layers'); } }
</script>

<template>
  <aside class="panel layers drawer side-l" :class="{ open: S.ui.left }">
    <div class="ph">
      <span class="ph-t">Layers</span>
      <span class="lab">{{ layersRev.length }}</span>
      <div class="spacer"></div>
      <button v-if="hasShy" class="ib" :class="{ on: S.ui.showShy }" @click="S.ui.showShy = !S.ui.showShy"
              title="Show/hide shy layers" v-html="U.icon('eye', 14)"></button>
      <button class="ib" @click="addMenu" title="Add layer" v-html="U.icon('add')"></button>
      <button class="ib only-narrow" @click="S.ui.left = false" title="Close panel" v-html="U.icon('close')"></button>
    </div>
    <div class="plist">
      <p class="empty" v-if="!visibleLayers.length">Nothing here yet.<br>Use <b>+</b> above — start with the demo beat and a generator.</p>
      <div v-for="l in visibleLayers" :key="l.id" class="row"
           :class="{ sel: S.sel === l.id, multi: S.multi.includes(l.id), lock: l.locked, shy: l.shy }"
           draggable="true"
           @click="select(l.id, $event)"
           @contextmenu="layerMenu($event, l)"
           @dragstart="onDragStart($event, l)"
           @dragover="onDragOver($event, l)"
           @dragend="onDragEnd">
        <span class="row-i" v-html="U.icon(l.icon || 'shape', 15)"></span>
        <input v-if="renaming === l.id" class="rn" v-model="renameVal" @blur="commitRename(l)" @keydown.enter="commitRename(l)" @click.stop autofocus>
        <template v-else>
          <span class="row-n" @dblclick="renaming = l.id; renameVal = l.name" :title="l.name">{{ l.name }}</span>
        </template>
        <div class="spacer"></div>
        <button v-if="l.fx?.length" class="fxcount lab" :title="l.fx.length + ' effects'" @click.stop="S.sel = l.id">{{ l.fx.filter(f => f.enabled).length }} fx</button>
        <button class="ib tiny" :class="{ dim: l.locked }" @click.stop="l.locked = !l.locked; S.vx.project.autosave()" :title="l.locked ? 'Unlock layer' : 'Lock layer'" v-html="U.icon('lock', 13)"></button>
        <button class="ib tiny" :class="{ dim: !l.visible }" @click.stop="l.visible = !l.visible; S.vx.project.autosave()" :title="l.visible ? 'Hide layer' : 'Show layer'" v-html="U.icon(l.visible ? 'eye' : 'eyeOff', 13)"></button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.layers { grid-area: left; display: flex; flex-direction: column; min-height: 0; }
.row.multi { outline: 1px dashed rgba(124, 108, 240, .7); outline-offset: -1px; }
.row.shy .row-n { opacity: .55; font-style: italic; }
@media (max-width: 1220px) {
  .layers { display: flex; }   /* keep flex layout while the .drawer class makes it an overlay */
}
.ph { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-bottom: 1px solid var(--line); }
.ph-t { font-weight: 600; font-size: 12.5px; }
.plist { overflow-y: auto; flex: 1; padding: 5px; }
.row {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-radius: 7px; cursor: pointer; user-select: none; border: 1px solid transparent;
  margin-bottom: 2px; color: var(--ink2);
}
.row:hover { background: var(--panel2); }
.row.sel { background: var(--panel2); border-color: var(--line2); color: var(--ink); }
.row-i { color: var(--ink3); display: flex; flex-shrink: 0; }
.row.sel .row-i { color: var(--acc); }
.row-n { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rn { background: var(--panel2); border: 1px solid var(--acc); border-radius: 4px; color: var(--ink); font-size: 12.5px; padding: 2px 6px; width: 100%; min-width: 0; }
.fxcount { border: 1px solid var(--line2); border-radius: 10px; padding: 0 7px; font-size: 10px; color: var(--acc); flex-shrink: 0; }
.ib.tiny { width: 24px; height: 24px; flex-shrink: 0; }
.ib.dim { opacity: .35; }
.empty { color: var(--ink3); font-size: 12px; line-height: 1.7; padding: 16px 12px; }
.empty b { color: var(--acc); font-weight: 600; }
</style>
