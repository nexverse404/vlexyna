<script setup>
import { computed, ref, watch } from 'vue';
import { S, openMenu, toast, touch, syncAll, confirmDlg, promptDlg, openModal } from '../store.js';
import { U } from '../../engine/util.js';
import ParamControl from './ParamControl.vue';
import { loadDemo, loadAudioFile } from '../appctl.js';

/* ═══════════ the vizzy-style left bar: seven tabs ═══════════ */
const TABS = [
  ['composition', 'Composition', 'layers'],
  ['analyzers', 'Analyzers', 'activity'],
  ['effects', 'Effects', 'fx'],
  ['automations', 'Automations', 'zap'],
  ['media', 'Media', 'media'],
  ['projects', 'Projects', 'folder'],
  ['lyrics', 'Lyrics', 'lyrics'],
];

/* ═══════════ Composition — the object tree ═══════════ */
const renaming = ref(null);
const renameVal = ref('');
const expanded = ref(new Set());
function toggleKids(id) {
  const s = new Set(expanded.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expanded.value = s;
}
const layersRev = computed(() => {
  S.rev;
  return S.vx?.project?.current ? [...S.vx.project.current.layers].reverse() : [];
});
const hasShy = computed(() => {
  S.rev;
  return !!(S.vx?.project?.current?.layers || []).some(l => l.shy);
});
const visibleLayers = computed(() => {
  S.rev;
  const all = layersRev.value;
  return S.ui.showShy ? all : all.filter(l => !l.shy);
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
  S.treeSel = null;
}
function selNode(l, kind, index, key) {
  S.sel = l.id;
  S.multi = [];
  S.treeSel = { layer: l.id, kind, ...(index != null ? { index } : {}), ...(key != null ? { key } : {}) };
}
const nodeSel = (l, kind, index, key) => {
  const t = S.treeSel;
  return !!t && t.layer === l.id && t.kind === kind && t.index === index && t.key === key;
};

function addLayer(type) {
  const VX = S.vx;
  const l = VX.layers.make(type);
  if (!l) return;
  VX.project.current.layers.push(l);
  VX.project.snapshot('add ' + type);
  S.sel = l.id;
  S.treeSel = null;
  S.rev++;
  toast(`Added ${l.name}`);
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

/* add an effect to a layer straight from the tree */
function addFxTo(e, l) {
  e.stopPropagation();
  const VX = S.vx;
  const items = [];
  for (const def of VX.fx.list) items.push({ label: def.name, ic: def.icon || 'fx', hint: def.desc, fn: () => { l.fx.push(VX.fx.make(def.id)); VX.project.snapshot(`add ${def.name}`); touch(); selNode(l, 'fx', l.fx.length - 1); toast(`${def.name} added to ${l.name}`); } });
  openMenu(e, items, { wide: true });
}

/* ═══════════ Analyzers ═══════════ */
const AN_DEF = [
  { t: 'text', key: 'name', label: 'Name' },
  { t: 'num', key: 'lo', label: 'Lower limit (Hz)', min: 20, max: 8000, step: 5 },
  { t: 'num', key: 'hi', label: 'Upper limit (Hz)', min: 40, max: 18000, step: 10 },
  { t: 'num', key: 'sens', label: 'Sensitivity', min: 0, max: 4, step: .05 },
  { t: 'num', key: 'smooth', label: 'Smoothing', min: 0, max: .95, step: .01 },
  { t: 'num', key: 'min', label: 'Min value', min: -2, max: 2, step: .01 },
  { t: 'num', key: 'max', label: 'Max value', min: -2, max: 4, step: .01 },
  { t: 'bool', key: 'delta', label: 'Delta (rate of change)' },
  { t: 'bool', key: 'cumulative', label: 'Cumulative' },
];
const analyzers = computed(() => {
  S.rev;
  const p = S.vx?.project?.current;
  if (p && !Array.isArray(p.analyzers)) p.analyzers = [];
  return p?.analyzers || [];
});
function addAnalyzer() {
  const p = S.vx.project.current;
  const n = (p.analyzers || (p.analyzers = [])).length + 1;
  p.analyzers.push({ id: U.uid(), name: 'Analyzer ' + n, lo: 20, hi: 140, sens: 1, smooth: 0, min: 0, max: 1, delta: false, cumulative: false, enabled: true });
  S.vx.project.snapshot('add analyzer'); touch();
}
function setAn(an, k, v, commit) {
  an[k] = v;
  S.vx.renderer && S.vx.renderer.invalidate();
  if (commit) S.vx.project.snapshot('analyzer ' + k);
}
function delAnalyzer(i) {
  S.vx.project.current.analyzers.splice(i, 1);
  S.vx.project.snapshot('remove analyzer'); touch();
}
const anValue = (name) => { S.time; return S.vx?.audio?.engine?.anValues?.[name] ?? 0; };

/* ═══════════ Effects (global post) ═══════════ */
const fxDefsByCat = computed(() => {
  if (!S.vx) return [];
  const cats = new Map();
  for (const def of S.vx.fx.list) {
    if (!cats.has(def.cat)) cats.set(def.cat, []);
    cats.get(def.cat).push(def);
  }
  const order = ['Blur', 'Light', 'Color', 'Warp', 'Stylize', 'Transform', 'Compositing', 'Temporal', 'Filter'];
  return [...cats.entries()].sort((a, b) => (order.indexOf(a[0]) + 100) - (order.indexOf(b[0]) + 100));
});
const fxName = (id) => S.vx.fx.byId[id]?.name || id;
const post = computed(() => { S.rev; return S.vx?.project?.current?.post || []; });
function addGlobalFx(e) {
  const items = [];
  for (const [cat, defs] of fxDefsByCat.value) {
    items.push({ sep: cat });
    for (const d of defs) items.push({
      label: d.name, ic: d.icon || 'fx', hint: d.desc,
      fn: () => { post.value.push(S.vx.fx.make(d.id)); S.vx.project.snapshot(`add ${d.name}`); touch(); toast(`${d.name} added globally`); },
    });
  }
  openMenu(e, items, { wide: true });
}
function postMenu(e, i) {
  e.stopPropagation();
  const chain = post.value;
  openMenu(e, [
    { label: chain[i].enabled ? 'Disable' : 'Enable', ic: chain[i].enabled ? 'eyeOff' : 'eye', fn: () => { chain[i].enabled = !chain[i].enabled; S.vx.project.autosave(); touch(); } },
    { label: 'Move up', ic: 'up', fn: () => { if (i > 0) { chain.splice(i - 1, 0, chain.splice(i, 1)[0]); S.vx.project.autosave(); touch(); } } },
    { label: 'Move down', ic: 'down', fn: () => { if (i < chain.length - 1) { chain.splice(i + 1, 0, chain.splice(i, 1)[0]); S.vx.project.autosave(); touch(); } } },
    { sep: '' },
    { label: 'Remove', ic: 'trash', danger: true, fn: () => { chain.splice(i, 1); S.vx.project.snapshot('remove effect'); touch(); } },
  ]);
}

/* ═══════════ Automations ═══════════ */
const autoOpen = ref(null);   /* layer.id + key of the row being edited */
const allAutomations = computed(() => {
  S.rev;
  const out = [];
  const proj = S.vx?.project?.current;
  if (!proj) return out;
  for (const l of proj.layers) {
    for (const [k, a] of Object.entries(l.auto || {})) out.push({ layer: l, key: k, a });
  }
  return out;
});
const autoExprOf = (a) => typeof a === 'string' ? a : (a?.expr ?? '');
const autoEnabled = (a) => typeof a === 'string' ? true : (a?.enabled !== false);
function toggleAuto(row) {
  const l = row.layer;
  const a = l.auto[row.key];
  if (typeof a === 'string') l.auto[row.key] = { expr: a, enabled: false };
  else if (a) {
    a.enabled = !(a.enabled !== false);
    if (a.enabled === true && Object.keys(a).length === 2 && a.expr) l.auto[row.key] = a.expr;
  }
  S.vx.project.snapshot('toggle automation'); touch();
}
function autoEdit(l, k, field, v, commit) {
  const cur = l.auto[k];
  const base = typeof cur === 'string' ? { expr: cur } : (cur ? { ...cur } : { expr: '' });
  if (field === 'expr') base.expr = v; else base[field] = v === '' ? undefined : +v;
  const extras = ['min', 'max', 'smooth', 'cumulative'].some(f => base[f] !== undefined && !(f === 'enabled' && base[f] === true)) || base.enabled === false;
  l.auto[k] = extras ? base : (base.expr || '');
  S.vx.renderer && S.vx.renderer.invalidate();
  if (commit) { S.vx.project.snapshot('automation ' + k); touch(); }
}
function delAuto(l, k) { delete l.auto[k]; S.vx.project.snapshot('remove automation'); touch(); }
function jumpLayer(l) { S.tab = 'composition'; S.sel = l.id; S.treeSel = null; }

/* ═══════════ Media ═══════════ */
const mediaTab = ref('stock');
const libRev = ref(0);
const stockList = computed(() => { libRev.value; return S.vx?.assets?.stock ? S.vx.assets.stock() : []; });
const libList = computed(() => { libRev.value; return (S.vx?.assets?.library ? S.vx.assets.library() : []).filter(x => x.kind !== 'audio'); });
function pickMediaFile(accept) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept; inp.multiple = true;
  inp.onchange = async () => {
    const VX = S.vx;
    for (const f of inp.files) {
      const isFont = (f.type || '').startsWith('font') || /\.(ttf|otf|woff2?)$/i.test(f.name);
      if (isFont) {
        const dataUrl = await U.readFile(f);
        VX.assets.addData('font', f.name, dataUrl);
        if (dataUrl.length < 1500000 && VX.assets.libraryAdd('font', f.name, dataUrl)) toast(`“${f.name}” saved to library`);
        else toast(`Font “${f.name}” registered (too large for the saved library)`, 'warn');
        continue;
      }
      const id = await VX.assets.addFile(f);
      const kind = f.type.startsWith('video') ? 'video' : 'image';
      const a = VX.assets.get(id);
      if (a?.dataUrl && a.dataUrl.length < 1500000) {
        if (VX.assets.libraryAdd(kind, f.name, a.dataUrl)) toast(`“${f.name}” saved to library`);
        else toast(`“${f.name}” added to this project (too large for the saved library)`, 'warn');
      } else toast(`“${f.name}” added to this project (too large for the saved library)`, 'warn');
    }
    libRev.value++;
  };
  inp.click();
}
function useStock(entry) {
  const VX = S.vx;
  const id = VX.assets.libraryUse(entry);
  const l = VX.layers.make('image'); l.props.assetId = id; l.name = entry.name.replace('Stock · ', '');
  VX.project.current.layers.push(l); VX.project.snapshot('add stock image');
  S.sel = l.id; S.treeSel = null; touch();
  toast(`${entry.name} added`);
}
function useLibItem(entry) {
  const VX = S.vx;
  if (entry.kind === 'font') { VX.assets.addData('font', entry.name, entry.dataUrl); toast(`Font “${entry.name}” registered`); return; }
  const id = VX.assets.libraryUse(entry);
  const l = VX.layers.make(entry.kind === 'video' ? 'video' : 'image');
  l.props.assetId = id; l.name = entry.name.slice(0, 24);
  VX.project.current.layers.push(l); VX.project.snapshot('add from library');
  S.sel = l.id; S.treeSel = null; touch();
}
function removeLib(i) { S.vx.assets.libraryRemove(i); libRev.value++; }

/* ═══════════ Projects ═══════════ */
const LS_KEY = 'vlexyna_projects_v1';
const projects = ref([]);
function refreshProjects() { projects.value = S.vx ? S.vx.project.list() : []; }
watch(() => S.tab, (t) => { if (t === 'projects') refreshProjects(); }, { immediate: true });
function openProject(id) {
  if (S.vx.project.open(id)) { S.sel = null; syncAll(); refreshProjects(); toast('Project opened'); }
  else toast('Could not open project', 'err');
}
function renameProject(p) {
  promptDlg(`Rename “${p.name}”`, p.name, (v) => {
    if (!v?.trim()) return;
    try {
      const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      if (all[p.id]) { all[p.id].name = v.trim(); localStorage.setItem(LS_KEY, JSON.stringify(all)); }
      if (S.vx.project.current.id === p.id) { S.vx.project.current.name = v.trim(); syncAll(); }
      refreshProjects();
    } catch (e) { toast('Rename failed', 'err'); }
  });
}
function delProject(id) {
  confirmDlg('Delete this project permanently?', () => { S.vx.project.remove(id); refreshProjects(); toast('Project deleted'); }, 'Delete');
}
function newProject() {
  confirmDlg('Start a new empty project? Your current project stays saved in the list.', () => {
    S.vx.project.newProject('Untitled'); S.sel = null; syncAll(); refreshProjects(); toast('New project created');
  }, 'New project');
}
function importVlx() {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = '.vlx,application/json';
  i.onchange = async () => {
    if (!i.files[0]) return;
    await S.vx.project.importFile(i.files[0]);
    S.sel = null; syncAll(); refreshProjects();
  };
  i.click();
}
function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}

/* ═══════════ Lyrics ═══════════ */
const lyricLayers = computed(() => {
  S.rev;
  return (S.vx?.project?.current?.layers || []).filter(l => l.type === 'lyrics');
});
function addLyricsLayer() {
  const VX = S.vx;
  const l = VX.layers.make('lyrics');
  VX.project.current.layers.push(l);
  VX.project.snapshot('add lyrics');
  S.sel = l.id; S.treeSel = null; touch();
  openModal('lyrics', { layer: l });
}
function importLyricsFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.lrc,.ttml,.txt';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    const VX = S.vx;
    const text = await U.readText(f);
    const lines = f.name.toLowerCase().endsWith('ttml') ? VX.layers.parseTTML(text) : VX.layers.parseLRC(text);
    let lyr = VX.project.current.layers.find(l => l.type === 'lyrics');
    if (!lyr) { lyr = VX.layers.make('lyrics'); VX.project.current.layers.push(lyr); }
    lyr.props.lines = lines;
    VX.project.snapshot('import lyrics');
    S.sel = lyr.id; S.treeSel = null; touch();
    toast(`Imported ${lines.length} lyric lines`);
  };
  inp.click();
}
</script>

<template>
  <aside class="panel layers drawer side-l" :class="{ open: S.ui.left }">
    <div class="vz-tabs">
      <button v-for="t in TABS" :key="t[0]" class="vz-tab" :class="{ on: S.tab === t[0] }" @click="S.tab = t[0]"
              :title="t[1]"><span v-html="U.icon(t[2], 13)"></span><span>{{ t[1] }}</span></button>
    </div>

    <!-- ═══════ COMPOSITION ═════════ -->
    <div v-if="S.tab === 'composition'" class="tabbody">
      <div class="ph">
        <span class="ph-t">Layers</span>
        <span class="lab">{{ layersRev.length }}</span>
        <div class="spacer"></div>
        <button v-if="hasShy" class="ib" :class="{ on: S.ui.showShy }" @click="S.ui.showShy = !S.ui.showShy"
                title="Show/hide shy layers" v-html="U.icon('eye', 14)"></button>
        <button class="ib" @click="addMenu" title="Add item" v-html="U.icon('add')"></button>
        <button class="ib only-narrow" @click="S.ui.left = false" title="Close panel" v-html="U.icon('close')"></button>
      </div>
      <div class="plist">
        <div class="row root" :class="{ sel: !S.sel }" @click="S.sel = null; S.multi = []; S.treeSel = null" title="The composition itself — canvas, camera, project settings">
          <span class="row-i" v-html="U.icon('logo', 14)"></span>
          <span class="row-n">Composition</span>
          <span class="lab" v-if="layersRev.length">{{ layersRev.length }}</span>
        </div>
        <p class="empty" v-if="!visibleLayers.length">Nothing here yet.<br>Use <b>+</b> above — start with the demo beat and a generator.</p>
        <template v-for="l in visibleLayers" :key="l.id">
          <div class="row"
               :class="{ sel: S.sel === l.id, multi: S.multi.includes(l.id), lock: l.locked, shy: l.shy }"
               draggable="true"
               @click="select(l.id, $event)"
               @contextmenu="layerMenu($event, l)"
               @dragstart="onDragStart($event, l)"
               @dragover="onDragOver($event, l)"
               @dragend="onDragEnd">
            <button class="ib tiny chev" :class="{ open: expanded.has(l.id) }" @click.stop="toggleKids(l.id)"
                    v-html="U.icon('play', 9)"></button>
            <span class="row-i" v-html="U.icon(l.icon || 'shape', 15)"></span>
            <input v-if="renaming === l.id" class="rn" v-model="renameVal" @blur="commitRename(l)" @keydown.enter="commitRename(l)" @click.stop autofocus>
            <span v-else class="row-n" @dblclick="renaming = l.id; renameVal = l.name" :title="l.name">{{ l.name }}</span>
            <div class="spacer"></div>
            <button v-if="l.fx?.length" class="fxcount lab" :title="l.fx.length + ' effects'" @click.stop="toggleKids(l.id)">{{ l.fx.filter(f => f.enabled).length }} fx</button>
            <button class="ib tiny" :class="{ dim: l.locked }" @click.stop="l.locked = !l.locked; S.vx.project.autosave()" :title="l.locked ? 'Unlock layer' : 'Lock layer'" v-html="U.icon('lock', 13)"></button>
            <button class="ib tiny" :class="{ dim: !l.visible }" @click.stop="l.visible = !l.visible; S.vx.project.autosave(); S.vx.renderer.invalidate()" :title="l.visible ? 'Hide layer' : 'Show layer'" v-html="U.icon(l.visible ? 'eye' : 'eyeOff', 13)"></button>
          </div>
          <div v-if="expanded.has(l.id)" class="tree-kids">
            <div class="tree-kid" :class="{ sel: nodeSel(l, 'item') }" @click="selNode(l, 'item')">
              <span class="row-i" v-html="U.icon(l.icon || 'shape', 12)"></span>
              <span>{{ S.vx.layers.byId[l.type]?.name || l.type }}</span>
              <span class="lab">item</span>
            </div>
            <div class="tree-sec lab">Effects</div>
            <div v-for="(f, i) in l.fx || []" :key="'fx' + i" class="tree-kid" :class="{ sel: nodeSel(l, 'fx', i) }" @click="selNode(l, 'fx', i)">
              <button class="ib tiny" @click.stop="f.enabled = !f.enabled; S.vx.project.autosave(); S.vx.renderer.invalidate()" v-html="U.icon(f.enabled ? 'eye' : 'eyeOff', 11)"></button>
              <span>{{ fxName(f.id) }}</span>
            </div>
            <button class="tree-kid add" @click="addFxTo($event, l)"><span v-html="U.icon('add', 11)"></span>add effect</button>
            <div class="tree-sec lab">Automations</div>
            <div v-for="(a, k) in l.auto || {}" :key="'au' + k" class="tree-kid" :class="{ sel: nodeSel(l, 'auto', null, k) }" @click="selNode(l, 'auto', null, k)">
              <button class="ib tiny" @click.stop="toggleAuto({ layer: l, key: k, a })" v-html="U.icon(autoEnabled(a) ? 'eye' : 'eyeOff', 11)"></button>
              <span>{{ k }}</span>
              <span class="mono">{{ autoExprOf(a) }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- ═══════ ANALYZERS ═════════ -->
    <div v-else-if="S.tab === 'analyzers'" class="tabbody">
      <div class="ph">
        <span class="ph-t">Audio analyzers</span>
        <div class="spacer"></div>
        <button class="ib" @click="addAnalyzer" title="Add analyzer" v-html="U.icon('add')"></button>
        <button class="ib only-narrow" @click="S.ui.left = false" title="Close panel" v-html="U.icon('close')"></button>
      </div>
      <div class="pbody">
        <p class="hint">Audio analyzers allow you to change how things react to audio. Use them in any automation as <code>an('Name')</code> or by name.</p>
        <div v-for="(an, i) in analyzers" :key="an.id" class="fxcard" :class="{ off: an.enabled === false }">
          <div class="fx-h">
            <button class="ib tiny" @click="setAn(an, 'enabled', an.enabled === false, true)" v-html="U.icon(an.enabled === false ? 'eyeOff' : 'eye', 13)"></button>
            <span class="fx-n">{{ an.name }}</span>
            <span class="lab mono anlive" v-if="an.enabled !== false">{{ anValue(an.name).toFixed(2) }}</span>
            <div class="spacer"></div>
            <button class="ib tiny" @click="delAnalyzer(i)" v-html="U.icon('trash', 13)"></button>
          </div>
          <div class="fx-p">
            <ParamControl v-for="ad in AN_DEF" :key="ad.key" :param="ad"
                          :get="() => an[ad.key]" :set="(v, c) => setAn(an, ad.key, v, c)" />
          </div>
        </div>
        <p class="empty" v-if="!analyzers.length">No analyzers yet. One reads a frequency band you choose — like a private <code>bass</code> knob for one layer.</p>
        <button class="btn small" @click="addAnalyzer"><span v-html="U.icon('add', 12)"></span>Add analyzer</button>
      </div>
    </div>

    <!-- ═══════ EFFECTS ═════════ -->
    <div v-else-if="S.tab === 'effects'" class="tabbody">
      <div class="ph">
        <span class="ph-t">Effects</span>
        <span class="lab">{{ post.length }}</span>
        <div class="spacer"></div>
        <button class="ib" @click="addGlobalFx" title="Add global effect" v-html="U.icon('add')"></button>
        <button class="ib only-narrow" @click="S.ui.left = false" title="Close panel" v-html="U.icon('close')"></button>
      </div>
      <div class="pbody">
        <p class="hint">Global effects apply to the whole frame after all layers. Per-layer effects live in the Composition tree.</p>
        <div v-for="(f, i) in post" :key="i" class="fxcard" :class="{ off: !f.enabled }" @contextmenu="postMenu($event, i)">
          <div class="fx-h">
            <button class="ib tiny" @click="f.enabled = !f.enabled; S.vx.project.autosave(); S.vx.renderer.invalidate()" v-html="U.icon(f.enabled ? 'eye' : 'eyeOff', 13)"></button>
            <span class="fx-n">{{ fxName(f.id) }}</span>
            <div class="spacer"></div>
            <button class="ib tiny" @click="post.splice(i, 1); S.vx.project.snapshot('remove effect'); touch()" v-html="U.icon('trash', 13)"></button>
          </div>
        </div>
        <p class="empty" v-if="!post.length">Nothing global yet. Glow or VHS over the whole frame works well.</p>
      </div>
    </div>

    <!-- ═══════ AUTOMATIONS ═════════ -->
    <div v-else-if="S.tab === 'automations'" class="tabbody">
      <div class="ph">
        <span class="ph-t">Automations</span>
        <span class="lab">{{ allAutomations.length }}</span>
        <div class="spacer"></div>
        <button class="ib only-narrow" @click="S.ui.left = false" title="Close panel" v-html="U.icon('close')"></button>
      </div>
      <div class="pbody">
        <p class="hint">Every automation in the project — bind any property to the music with the <b>ƒ</b> button in the Inspector.</p>
        <div v-for="row in allAutomations" :key="row.layer.id + row.key" class="auto-card" :class="{ off: !autoEnabled(row.a) }">
          <div class="auto-row">
            <button class="ib tiny" @click="toggleAuto(row)" v-html="U.icon(autoEnabled(row.a) ? 'eye' : 'eyeOff', 12)"></button>
            <code class="auto-k">{{ row.key }}</code>
            <span class="an-who" @click="jumpLayer(row.layer)" :title="'Jump to ' + row.layer.name">{{ row.layer.name }}</span>
            <div class="spacer"></div>
            <button class="ib tiny" @click="delAuto(row.layer, row.key)" v-html="U.icon('trash', 12)"></button>
          </div>
          <div class="auto-adv">
            <input class="tin mono" :value="autoExprOf(row.a)" spellcheck="false" placeholder="e.g. beat*0.3"
                   @change="autoEdit(row.layer, row.key, 'expr', $event.target.value, true)">
            <label>min <input class="numin mono" type="number" step="0.05" :value="typeof row.a === 'object' && row.a.min != null ? row.a.min : ''"
                   @change="autoEdit(row.layer, row.key, 'min', $event.target.value, true)"></label>
            <label>max <input class="numin mono" type="number" step="0.05" :value="typeof row.a === 'object' && row.a.max != null ? row.a.max : ''"
                   @change="autoEdit(row.layer, row.key, 'max', $event.target.value, true)"></label>
            <label>smooth <input class="numin mono" type="number" step="0.05" min="0" max="0.95" :value="typeof row.a === 'object' && row.a.smooth != null ? row.a.smooth : ''"
                   @change="autoEdit(row.layer, row.key, 'smooth', $event.target.value, true)"></label>
          </div>
        </div>
        <p class="empty" v-if="!allAutomations.length">No automations yet. Press <b>ƒ</b> beside any slider in the Inspector.</p>
      </div>
    </div>

    <!-- ═══════ MEDIA ═════════ -->
    <div v-else-if="S.tab === 'media'" class="tabbody">
      <div class="ph">
        <span class="ph-t">Media</span>
        <div class="spacer"></div>
        <button class="ib only-narrow" @click="S.ui.left = false" title="Close panel" v-html="U.icon('close')"></button>
      </div>
      <div class="pbody">
        <div class="m-tabs">
          <button :class="{ on: mediaTab === 'stock' }" @click="mediaTab = 'stock'">Stock</button>
          <button :class="{ on: mediaTab === 'uploads' }" @click="mediaTab = 'uploads'">Uploads</button>
          <button :class="{ on: mediaTab === 'audio' }" @click="mediaTab = 'audio'">Audio</button>
        </div>
        <template v-if="mediaTab === 'stock'">
          <p class="hint">Generated in your browser — no downloads, free to use in any project.</p>
          <div class="media-grid">
            <div v-for="(st, i) in stockList" :key="i" class="media-card" @click="useStock(st)">
              <img :src="st.dataUrl" alt="">
              <span class="mc-n">{{ st.name }}</span>
              <span class="mc-add">＋ add</span>
            </div>
          </div>
        </template>
        <template v-else-if="mediaTab === 'audio'">
          <p class="hint">Audio attaches to the whole project. Drop any audio file anywhere, or synthesize a track:</p>
          <button class="btn small" @click="loadDemo"><span v-html="U.icon('music', 12)"></span>Demo beat</button>
        </template>
        <template v-else>
          <p class="hint">If you need to reuse the same media in multiple projects, upload it here. It stays in this browser.</p>
          <div class="btn-row wrap" style="margin-bottom:10px">
            <button class="btn small" @click="pickMediaFile('image/*')"><span v-html="U.icon('add', 12)"></span>Upload image</button>
            <button class="btn small" @click="pickMediaFile('video/*')"><span v-html="U.icon('add', 12)"></span>Upload video</button>
            <button class="btn small" @click="pickMediaFile('.ttf,.otf,.woff,.woff2,font/*')"><span v-html="U.icon('add', 12)"></span>Upload font</button>
          </div>
          <div class="media-grid" v-if="libList.length">
            <div v-for="(entry, i) in libList" :key="i" class="media-card">
              <img v-if="entry.kind !== 'font'" :src="entry.dataUrl" alt="" @click="useLibItem(entry)">
              <span v-else class="mc-font" @click="useLibItem(entry)">Aa</span>
              <span class="mc-n">{{ entry.name }}</span>
              <span class="mc-add" @click="useLibItem(entry)">＋ use</span>
              <button class="ib tiny mc-del" @click.stop="removeLib(i)" v-html="U.icon('trash', 12)"></button>
            </div>
          </div>
          <p class="empty" v-else>Nothing uploaded yet — files under ~1.5 MB persist across projects in this browser.</p>
        </template>
      </div>
    </div>

    <!-- ═══════ PROJECTS ═════════ -->
    <div v-else-if="S.tab === 'projects'" class="tabbody">
      <div class="ph">
        <span class="ph-t">Projects</span>
        <div class="spacer"></div>
        <button class="ib" @click="newProject" title="New project" v-html="U.icon('plus')"></button>
        <button class="ib only-narrow" @click="S.ui.left = false" title="Close panel" v-html="U.icon('close')"></button>
      </div>
      <div class="pbody">
        <div class="btn-row wrap" style="margin-bottom:10px">
          <button class="btn small" @click="newProject"><span v-html="U.icon('plus', 12)"></span>New</button>
          <button class="btn small" @click="importVlx"><span v-html="U.icon('save', 12)"></span>Import .vlx</button>
          <button class="btn small" @click="S.vx.project.exportFile(); toast('Project exported as .vlx')"><span v-html="U.icon('export', 12)"></span>Export</button>
        </div>
        <div v-for="p in projects" :key="p.id" class="row proj" :class="{ sel: p.id === S.vx.project.current.id }">
          <span class="row-i" v-html="U.icon('folder', 14)"></span>
          <span class="row-n" :title="p.name" @click="openProject(p.id)">{{ p.name }}</span>
          <span class="lab">{{ p.layers }} layers · {{ fmtDate(p.updated) }}</span>
          <div class="spacer"></div>
          <button class="ib tiny" @click.stop="renameProject(p)" v-html="U.icon('edit', 12)"></button>
          <button class="ib tiny" @click.stop="delProject(p.id)" v-html="U.icon('trash', 12)"></button>
        </div>
        <p class="empty" v-if="!projects.length">No saved projects yet — they autosave to this browser as you work.</p>
      </div>
    </div>

    <!-- ═══════ LYRICS ═════════ -->
    <div v-else-if="S.tab === 'lyrics'" class="tabbody">
      <div class="ph">
        <span class="ph-t">Lyrics</span>
        <div class="spacer"></div>
        <button class="ib" @click="addLyricsLayer" title="New lyrics layer" v-html="U.icon('plus')"></button>
        <button class="ib only-narrow" @click="S.ui.left = false" title="Close panel" v-html="U.icon('close')"></button>
      </div>
      <div class="pbody">
        <p class="hint">Add and sync lyrics with the music — LRC / TTML import, tap-sync stamping, karaoke sweeps.</p>
        <div class="btn-row wrap" style="margin-bottom:10px">
          <button class="btn small" @click="addLyricsLayer"><span v-html="U.icon('plus', 12)"></span>New lyrics</button>
          <button class="btn small" @click="importLyricsFile"><span v-html="U.icon('save', 12)"></span>Import LRC / TTML</button>
        </div>
        <div v-for="l in lyricLayers" :key="l.id" class="row proj">
          <span class="row-i" v-html="U.icon('lyrics', 14)"></span>
          <span class="row-n">{{ l.name }}</span>
          <span class="lab">{{ (l.props.lines || []).length }} lines</span>
          <div class="spacer"></div>
          <button class="btn small" @click="openModal('lyrics', { layer: l })">Edit</button>
        </div>
        <p class="empty" v-if="!lyricLayers.length">No lyrics layers yet.</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.layers { grid-area: left; display: flex; flex-direction: column; min-height: 0; }
@media (max-width: 1220px) { .layers { display: flex; } }
.tabbody { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.pbody { overflow-y: auto; flex: 1; padding: 10px 12px; }
.ph { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-bottom: 1px solid var(--line); }
.ph-t { font-weight: 600; font-size: 12.5px; }
.plist { overflow-y: auto; flex: 1; padding: 5px; }
.row {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  border-radius: 7px; cursor: pointer; user-select: none; border: 1px solid transparent;
  margin-bottom: 2px; color: var(--ink2);
}
.row:hover { background: var(--panel2); }
.row.sel { background: rgba(75, 50, 200, .14); border-color: rgba(75, 50, 200, .4); color: var(--ink); }
.row.multi { outline: 1px dashed rgba(143, 127, 232, .7); outline-offset: -1px; }
.row.shy .row-n { opacity: .55; font-style: italic; }
.row.root { color: var(--ink3); margin-bottom: 6px; }
.row-i { color: var(--ink3); display: flex; flex-shrink: 0; }
.row.sel .row-i { color: var(--acc-ink); }
.row-n { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rn { background: var(--panel2); border: 1px solid var(--acc); border-radius: 4px; color: var(--ink); font-size: 12.5px; padding: 2px 6px; width: 100%; min-width: 0; }
.fxcount { border: 1px solid var(--line2); border-radius: 10px; padding: 0 7px; font-size: 10px; color: var(--acc-ink); flex-shrink: 0; }
.ib.tiny { width: 24px; height: 24px; flex-shrink: 0; }
.ib.dim { opacity: .35; }
.chev { width: 18px; height: 18px; padding: 0; }
.chev :deep(svg) { display: block; }
.empty { color: var(--ink3); font-size: 12px; line-height: 1.7; padding: 16px 12px; }
.empty b, .hint b { color: var(--acc-ink); font-weight: 600; }
.hint { font-size: 11.5px; color: var(--ink3); line-height: 1.6; margin-bottom: 12px; }
.hint code { font-family: 'IBM Plex Mono', monospace; color: var(--data); font-size: 10.5px; }
.fxcard { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
.fxcard.off { opacity: .5; }
.fx-h { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.fx-n { font-size: 12px; font-weight: 600; }
.fx-p { margin-left: -4px; }
.anlive { color: var(--data); flex-shrink: 0; }
.auto-card { border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; margin-bottom: 7px; }
.auto-card.off { opacity: .5; }
.auto-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.auto-k { min-width: 52px; flex-shrink: 0; font-family: 'IBM Plex Mono', monospace; color: var(--data); font-size: 10.5px; }
.auto-adv { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.auto-adv label { font-size: 10px; color: var(--ink3); display: flex; align-items: center; gap: 4px; }
.auto-adv .numin { width: 48px; }
.auto-adv .tin { flex: 1; min-width: 90px; }
.an-who { font-size: 10.5px; color: var(--ink3); max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; flex-shrink: 0; }
.an-who:hover { color: var(--acc-ink); }
.m-tabs { display: flex; gap: 2px; background: var(--bg); border: 1px solid var(--line); border-radius: 7px; padding: 2px; margin-bottom: 12px; }
.m-tabs button { border: none; background: none; color: var(--ink3); font-size: 11.5px; font-weight: 600; padding: 4px 12px; border-radius: 5px; cursor: pointer; font-family: inherit; }
.m-tabs button.on { background: var(--panel2); color: var(--ink); }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.media-card { position: relative; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; cursor: pointer; background: var(--panel2); }
.media-card:hover { border-color: var(--acc); }
.media-card img { display: block; width: 100%; height: 58px; object-fit: cover; }
.mc-font { display: flex; align-items: center; justify-content: center; height: 58px; font-size: 24px; font-weight: 700; color: var(--acc-ink); }
.mc-n { display: block; font-size: 10px; color: var(--ink2); padding: 4px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-add { position: absolute; top: 4px; right: 4px; font-size: 9px; background: rgba(20, 20, 21, .85); border: 1px solid var(--line2); color: var(--acc-ink); border-radius: 4px; padding: 1px 5px; opacity: 0; transition: opacity .15s; }
.media-card:hover .mc-add { opacity: 1; }
.mc-del { position: absolute; top: 3px; left: 3px; opacity: 0; }
.media-card:hover .mc-del { opacity: 1; }
.row.proj { border: 1px solid var(--line); margin-bottom: 4px; }
.row.proj .lab { font-size: 9.5px; white-space: nowrap; }
</style>
