<script setup>
import { ref, computed } from 'vue';
import { S, openMenu, toast, touch } from '../store.js';
import { U } from '../../engine/util.js';
import ParamControl from './ParamControl.vue';

const tab = ref('props');

const BLENDS = [
  ['source-over', 'Normal'], ['lighter', 'Add (glow)'], ['screen', 'Screen'], ['overlay', 'Overlay'],
  ['multiply', 'Multiply'], ['difference', 'Difference'], ['exclusion', 'Exclusion'],
  ['soft-light', 'Soft light'], ['hard-light', 'Hard light'], ['color-dodge', 'Dodge'],
  ['darken', 'Darken'], ['lighten', 'Lighten'], ['hue', 'Hue'], ['luminosity', 'Luminosity'],
];
const TRANSFORM = [
  { t: 'num', key: 'x', label: 'Position X', min: -0.5, max: 1.5, step: 0.001 },
  { t: 'num', key: 'y', label: 'Position Y', min: -0.5, max: 1.5, step: 0.001 },
  { t: 'num', key: 'scale', label: 'Scale', min: 0.01, max: 5, step: 0.01 },
  { t: 'num', key: 'rotation', label: 'Rotation (°)', min: -720, max: 720, step: 1 },
  { t: 'num', key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01 },
  { t: 'sel', key: 'blend', label: 'Blend mode', options: BLENDS },
  { t: 'sel', key: 'mirror', label: 'Mirror', options: [['none', 'None'], ['h', 'Horizontal'], ['v', 'Vertical'], ['quad', 'Quad']] },
];

const selL = computed(() => {
  S.rev;
  if (!S.vx?.project?.current) return null;
  return S.vx.project.current.layers.find(l => l.id === S.sel) || null;
});

/* ── global camera — zoom & shake with the music (edit-style camera) ── */
const camDefs = [
  { t: 'bool', key: 'on', label: 'Camera on' },
  { t: 'num', key: 'zoom', label: 'Zoom', min: .2, max: 4, step: .01 },
  { t: 'num', key: 'x', label: 'Pan X', min: -1, max: 1, step: .005 },
  { t: 'num', key: 'y', label: 'Pan Y', min: -1, max: 1, step: .005 },
  { t: 'num', key: 'rot', label: 'Rotation (°)', min: -45, max: 45, step: .5 },
  { t: 'num', key: 'zoomBass', label: 'Bass zoom', min: 0, max: 1, step: .01 },
  { t: 'num', key: 'zoomBeat', label: 'Beat zoom (punch-in)', min: 0, max: .5, step: .005 },
  { t: 'num', key: 'rotBeat', label: 'Beat rotation', min: 0, max: 20, step: .5 },
  { t: 'num', key: 'shake', label: 'Shake', min: 0, max: 5, step: .05 },
  { t: 'num', key: 'shakeBeat', label: 'Beat shake', min: 0, max: 5, step: .05 },
  { t: 'num', key: 'rotShake', label: 'Shake rotation (°)', min: 0, max: 10, step: .1 },
];
const CAM_FALLBACK = { on: false, zoom: 1, x: 0, y: 0, rot: 0, zoomBass: 0, zoomBeat: 0, rotBeat: 0, shake: 0, shakeBeat: 0, rotShake: 1 };
function cam() {
  const p = S.vx?.project?.current;
  if (!p) return CAM_FALLBACK;
  if (!p.camera) S.vx.project.ensureCamera(p);
  return p.camera || CAM_FALLBACK;
}
function camVal(k) { S.rev; return cam()[k]; }
function setCam(k, v, commit) {
  cam()[k] = v;
  S.vx.renderer && S.vx.renderer.invalidate();
  if (commit) { S.vx.project.snapshot('camera ' + k); touch(); }
}
function camPreset(name) {
  const P = {
    punch: { on: true, zoom: 1.04, zoomBass: .025, zoomBeat: .05, shake: 0, shakeBeat: .35, rotShake: .8, rot: 0, rotBeat: 0, x: 0, y: 0 },
    breathe: { on: true, zoom: 1.1, zoomBass: .06, zoomBeat: 0, shake: 0, shakeBeat: 0, rotShake: 1, rot: 0, rotBeat: 0, x: 0, y: 0 },
    quake: { on: true, zoom: 1.05, zoomBass: .02, zoomBeat: .04, shake: .8, shakeBeat: 1.2, rotShake: 2, rot: 0, rotBeat: 1, x: 0, y: 0 },
    off: { on: false },
  };
  Object.assign(cam(), P[name] || {});
  S.vx.project.autosave();
  touch();
}
const selDef = computed(() => (selL.value && S.vx.layers.byId[selL.value.type]) || null);
/* force controls to re-read values when the project itself changes (undo, template, import) */
const genKey = computed(() => `${S.rev}:${S.sel}:${tab.value}`);

function get(o, k) { return () => o[k]; }
function set(o, k) {
  return (v, commit = true) => {
    o[k] = v;
    S.vx.renderer && S.vx.renderer.invalidate();          /* live preview while dragging */
    if (commit) { S.vx.project.snapshot('edit ' + k); }   /* and it is undoable */
  };
}

/* flatten P.group definitions into titled sections */
function sections(def) {
  const out = [];
  for (const p of (def?.params || [])) {
    if (p.t === 'group') {
      const inner = [];
      for (const q of p.params) {
        if (q.t === 'group') inner.push(...q.params.map(r => ({ ...r, _sub: true })));
        else inner.push(q);
      }
      out.push({ title: p.label, params: inner, open: p.open !== false });
    } else out.push({ title: null, params: [p] });
  }
  return out.filter(s => s.params.length);
}

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

function addFx(target, layer) {
  return (e) => {
    const items = [];
    for (const [cat, defs] of fxDefsByCat.value) {
      items.push({ sep: cat });
      for (const d of defs) items.push({
        label: d.name, ic: d.icon || 'fx', hint: d.desc,
        fn: () => { target.push(S.vx.fx.make(d.id)); S.vx.project.snapshot(`add ${d.name}`); touch(); toast(`${d.name} added`); if (layer) S.sel = layer.id; },
      });
    }
    openMenu(e, items, { wide: true });
  };
}
function fxMenu(e, chain, i) {
  e.stopPropagation();
  const VX = S.vx;
  openMenu(e, [
    { label: chain[i].enabled ? 'Disable' : 'Enable', ic: chain[i].enabled ? 'eyeOff' : 'eye', fn: () => { chain[i].enabled = !chain[i].enabled; VX.project.autosave(); touch(); } },
    { label: 'Move up', ic: 'up', fn: () => { if (i > 0) { chain.splice(i - 1, 0, chain.splice(i, 1)[0]); VX.project.autosave(); touch(); } } },
    { label: 'Move down', ic: 'down', fn: () => { if (i < chain.length - 1) { chain.splice(i + 1, 0, chain.splice(i, 1)[0]); VX.project.autosave(); touch(); } } },
    { sep: '' },
    { label: 'Remove', ic: 'trash', danger: true, fn: () => { chain.splice(i, 1); VX.project.snapshot('remove effect'); touch(); } },
  ]);
}
const post = computed(() => { S.rev; return S.vx?.project?.current?.post || []; });

/* ── audio analyzers — custom named analysis channels ── */
const AN_DEF = [
  { t: 'text', key: 'name', label: 'Name' },
  { t: 'num', key: 'lo', label: 'Lower limit (Hz)', min: 20, max: 8000, step: 5 },
  { t: 'num', key: 'hi', label: 'Upper limit (Hz)', min: 40, max: 18000, step: 10 },
  { t: 'num', key: 'sens', label: 'Sensitivity', min: 0, max: 4, step: .05 },
  { t: 'num', key: 'smooth', label: 'Smoothing', min: 0, max: .95, step: .01 },
  { t: 'num', key: 'min', label: 'Min value', min: -2, max: 2, step: .01 },
  { t: 'num', key: 'max', label: 'Max value', min: -2, max: 4, step: .01 },
  { t: 'bool', key: 'delta', label: 'Delta (rate of change)' },
  { t: 'bool', key: 'enabled', label: 'Enabled' },
];
const analyzers = computed(() => { S.rev; const p = S.vx?.project?.current; if (p && !Array.isArray(p.analyzers)) p.analyzers = []; return p?.analyzers || []; });
function addAnalyzer() {
  const p = S.vx.project.current;
  const n = (p.analyzers || (p.analyzers = [])).length + 1;
  p.analyzers.push({ id: U.uid(), name: 'Analyzer ' + n, lo: 20, hi: 140, sens: 1, smooth: 0, min: 0, max: 1, delta: false, enabled: true });
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

/* ── automations browser — every automation in the project, vizzy-style ── */
const allAutomations = computed(() => {
  S.rev;
  const out = [];
  const proj = S.vx?.project?.current;
  if (!proj) return out;
  for (const l of proj.layers) {
    for (const [k, a] of Object.entries(l.auto || {})) {
      out.push({ layer: l, key: k, a });
    }
  }
  return out;
});
const autoExprOf = (a) => typeof a === 'string' ? a : (a?.expr ?? '');
const autoEnabled = (a) => typeof a === 'string' ? true : (a?.enabled !== false);
function toggleAuto(row) {
  const l = row.layer;
  const a = l.auto[row.key];
  if (typeof a === 'string') l.auto[row.key] = { expr: a, enabled: false };
  else if (a) { a.enabled = !(a.enabled !== false); if (a.enabled === true && Object.keys(a).length === 2 && a.expr) l.auto[row.key] = a.expr; }
  S.vx.project.snapshot('toggle automation'); touch();
}
function jumpAuto(row) { S.sel = row.layer.id; tab.value = 'auto'; }

/* ── auto tab: normalize string ↔ object when editing advanced fields ── */
function autoEdit(l, k, field, v, commit) {
  const cur = l.auto[k];
  const base = typeof cur === 'string' ? { expr: cur } : (cur ? { ...cur } : { expr: '' });
  if (field === 'expr') base.expr = v; else base[field] = v === '' ? undefined : +v;
  /* collapse back to a plain string when no extras are set */
  const extras = ['min', 'max', 'smooth', 'enabled'].some(f => base[f] !== undefined && !(f === 'enabled' && base[f] === true));
  l.auto[k] = extras || base.enabled === false ? base : (base.expr || '');
  S.vx.renderer && S.vx.renderer.invalidate();
  if (commit) { S.vx.project.snapshot('automation ' + k); touch(); }
}
</script>

<template>
  <aside class="panel insp drawer side-r" :class="{ open: S.ui.right }">
    <div class="ph">
      <span class="ph-t">Inspector</span>
      <div class="spacer"></div>
      <div v-if="selL" class="tabs">
        <button v-for="t in ['props', 'auto', 'fx']" :key="t" :class="{ on: tab === t }" @click="tab = t">
          <span v-html="U.icon(t === 'props' ? 'sliders' : t === 'auto' ? 'zap' : 'fx', 11)"></span>
          <span>{{ t === 'props' ? 'Layer' : t === 'auto' ? 'Auto' : 'Effects' }}</span>
        </button>
      </div>
      <button class="ib only-narrow" @click="S.ui.right = false" title="Close panel" v-html="U.icon('close')"></button>
    </div>

    <div class="pbody">
      <!-- no selection: analyzers, automations, camera, global post effects -->
      <template v-if="!selL">
        <div class="grp">
          <div class="grp-t"><span v-html="U.icon('activity', 12)"></span> Audio analyzers</div>
          <p class="hint" style="margin-bottom:8px">Custom analysis channels — each reads its own frequency band. Use them in any automation as <code>an('Name')</code> or by name.</p>
          <div v-for="(an, i) in analyzers" :key="an.id" class="fxcard">
            <div class="fx-h">
              <button class="ib tiny" @click="setAn(an, 'enabled', !an.enabled, true)" v-html="U.icon(an.enabled === false ? 'eyeOff' : 'eye', 13)"></button>
              <span class="fx-n">{{ an.name }}</span>
              <span class="lab mono anlive" v-if="an.enabled !== false">{{ (anValue(an.name) ?? 0).toFixed(2) }}</span>
              <div class="spacer"></div>
              <button class="ib tiny" @click="delAnalyzer(i)" v-html="U.icon('trash', 13)"></button>
            </div>
            <div class="fx-p">
              <ParamControl v-for="ad in AN_DEF.filter(d => d.key !== 'enabled')" :key="ad.key" :param="ad"
                            :get="() => an[ad.key]" :set="(v, c) => setAn(an, ad.key, v, c)" />
            </div>
          </div>
          <button class="btn small" @click="addAnalyzer"><span v-html="U.icon('add', 12)"></span>Add analyzer</button>
        </div>

        <div class="grp" v-if="allAutomations.length">
          <div class="grp-t"><span v-html="U.icon('zap', 12)"></span> Automations ({{ allAutomations.length }})</div>
          <div v-for="(row, i) in allAutomations" :key="row.layer.id + row.key" class="auto-row browse">
            <button class="ib tiny" @click="toggleAuto(row)" v-html="U.icon(autoEnabled(row.a) ? 'eye' : 'eyeOff', 12)"></button>
            <code class="auto-k" :title="row.layer.name + ' · ' + row.key">{{ row.key }}</code>
            <span class="an-who" @click="jumpAuto(row)" :title="'Jump to ' + row.layer.name">{{ row.layer.name }}</span>
            <code class="an-exp mono">{{ autoExprOf(row.a) }}</code>
          </div>
        </div>

        <div class="grp">
          <div class="grp-t"><span v-html="U.icon('cameraIcon', 12)"></span> Camera — moves with the music</div>
          <ParamControl v-for="cd in camDefs" :key="cd.key" :param="cd"
                        :get="() => camVal(cd.key)" :set="(v, c) => setCam(cd.key, v, c)" />
          <div class="btn-row wrap" style="margin-top:6px">
            <button class="btn small" @click="camPreset('punch')">Punch</button>
            <button class="btn small" @click="camPreset('breathe')">Breathe</button>
            <button class="btn small" @click="camPreset('quake')">Quake</button>
            <button class="btn small" @click="camPreset('off')">Off</button>
          </div>
        </div>
        <p class="hint">No layer selected — editing <b>global post effects</b>, applied to the whole frame after all layers. The <b>camera</b> above transforms everything together: zoom punches in on the bass and beats, shake jolts on impact.</p>
        <button class="btn small addfx" @click="addFx(post, null)"><span v-html="U.icon('add', 12)"></span>Add global effect</button>
        <div :key="'gp' + genKey">
          <div v-for="(f, i) in post" :key="i" class="fxcard" :class="{ off: !f.enabled }" @contextmenu="fxMenu($event, post, i)">
            <div class="fx-h">
              <button class="ib tiny" @click="f.enabled = !f.enabled; S.vx.project.autosave()" v-html="U.icon(f.enabled ? 'eye' : 'eyeOff', 13)"></button>
              <span class="fx-n">{{ fxName(f.id) }}</span>
              <div class="spacer"></div>
              <button class="ib tiny" @click="post.splice(i, 1); S.vx.project.snapshot('remove effect'); touch()" v-html="U.icon('trash', 13)"></button>
            </div>
            <div class="fx-p">
              <ParamControl v-for="p in (S.vx.fx.byId[f.id]?.params || [])" :key="p.key" :param="p"
                            :get="() => f.params[p.key]" :set="(v, c) => { f.params[p.key] = v; if (c) S.vx.project.autosave(); }" />
            </div>
          </div>
          <p class="empty" v-if="!post.length">Nothing global yet. Glow or VHS over the whole frame works well.</p>
        </div>
      </template>

      <template v-else-if="tab === 'props'">
        <div :key="'p' + genKey">
          <div class="grp">
            <div class="grp-t">Transform</div>
            <ParamControl v-for="p in TRANSFORM" :key="p.key" :param="p" :get="get(selL, p.key)" :set="set(selL, p.key)" :layer="selL" />
          </div>
          <div class="grp">
            <div class="grp-t">Timing</div>
            <ParamControl :param="{ t: 'num', key: 'start', label: 'Start (s)', min: 0, max: Math.max(60, S.dur), step: 0.05 }" :get="() => selL.start || 0" :set="(v, c) => { selL.start = v; if (c) S.vx.project.autosave(); }" />
            <ParamControl :param="{ t: 'num', key: 'end', label: 'End (s) — blank = whole project', min: 0, max: Math.max(60, S.dur), step: 0.05 }" :get="() => selL.end ?? 0" :set="(v, c) => { selL.end = v > 0 ? v : null; if (c) S.vx.project.autosave(); }" />
          </div>
          <div v-for="(sec, si) in sections(selDef)" :key="si" class="grp">
            <div class="grp-t" v-if="sec.title">{{ sec.title }}</div>
            <ParamControl v-for="p in sec.params" :key="p.key" :param="p" :get="get(selL.props, p.key)" :set="set(selL.props, p.key)" :layer="selL" />
          </div>
        </div>
      </template>

      <template v-else-if="tab === 'auto'">
        <p class="hint">Bind any property to the music — <code>bass</code>, <code>mid</code>, <code>treble</code>, <code>level</code>, <code>beat</code>, <code>t</code>, <code>freq(n)</code>, <code>fft(f0,f1)</code>, <code>an('Name')</code>. Evaluated every frame.</p>
        <div :key="'a' + genKey">
          <div v-for="(expr, k) in selL.auto || {}" :key="k" class="auto-card" :class="{ off: !autoEnabled(expr) }">
            <div class="auto-row">
              <button class="ib tiny" @click="toggleAuto({ layer: selL, key: k, a: expr })" v-html="U.icon(autoEnabled(expr) ? 'eye' : 'eyeOff', 12)"></button>
              <code class="auto-k">{{ k }}</code>
              <input class="tin mono" :value="autoExprOf(expr)" spellcheck="false" placeholder="e.g. beat*0.3"
                     @change="autoEdit(selL, k, 'expr', $event.target.value, true)">
              <button class="ib tiny" @click="delete selL.auto[k]; S.vx.project.snapshot('remove automation'); touch()" v-html="U.icon('close', 12)"></button>
            </div>
            <div class="auto-adv">
              <label>min <input class="numin mono" type="number" step="0.05" :value="typeof expr === 'object' && expr.min != null ? expr.min : ''"
                     @change="autoEdit(selL, k, 'min', $event.target.value, true)"></label>
              <label>max <input class="numin mono" type="number" step="0.05" :value="typeof expr === 'object' && expr.max != null ? expr.max : ''"
                     @change="autoEdit(selL, k, 'max', $event.target.value, true)"></label>
              <label>smooth <input class="numin mono" type="number" step="0.05" min="0" max="0.95" :value="typeof expr === 'object' && expr.smooth != null ? expr.smooth : ''"
                     @change="autoEdit(selL, k, 'smooth', $event.target.value, true)"></label>
            </div>
          </div>
          <p class="empty" v-if="!Object.keys(selL.auto || {}).length">No automations yet. Open the <b>Layer</b> tab and press <code>ƒ</code> beside a slider.</p>
        </div>
      </template>

      <template v-else>
        <button class="btn small addfx" @click="addFx(selL.fx, selL)"><span v-html="U.icon('add', 12)"></span>Add effect</button>
        <div :key="'f' + genKey">
          <div v-for="(f, i) in selL.fx || []" :key="i" class="fxcard" :class="{ off: !f.enabled }" @contextmenu="fxMenu($event, selL.fx, i)">
            <div class="fx-h">
              <button class="ib tiny" @click="f.enabled = !f.enabled; S.vx.project.autosave()" v-html="U.icon(f.enabled ? 'eye' : 'eyeOff', 13)"></button>
              <span class="fx-n">{{ fxName(f.id) }}</span>
              <div class="spacer"></div>
              <button class="ib tiny" @click="selL.fx.splice(i, 1); S.vx.project.snapshot('remove effect'); touch()" v-html="U.icon('trash', 13)"></button>
            </div>
            <div class="fx-p">
              <ParamControl v-for="p in (S.vx.fx.byId[f.id]?.params || [])" :key="p.key" :param="p"
                            :get="() => f.params[p.key]" :set="(v, c) => { f.params[p.key] = v; if (c) S.vx.project.autosave(); }" />
            </div>
          </div>
          <p class="empty" v-if="!(selL.fx || []).length">No effects on this layer. Try <b>Glow</b> or <b>Kaleidoscope</b>.</p>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.insp { grid-area: right; display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--line); }
@media (max-width: 1220px) {
  .insp { border-left: none; }
}
.pbody { overflow-y: auto; flex: 1; padding: 10px 12px; }
.tabs { display: flex; gap: 2px; background: var(--bg); border: 1px solid var(--line); border-radius: 7px; padding: 2px; }
.tabs button {
  border: none; background: none; color: var(--ink3); font-size: 11px; font-weight: 600;
  padding: 3px 10px; border-radius: 5px; cursor: pointer; font-family: inherit;
}
.tabs button.on { background: var(--panel2); color: var(--ink); }
.grp { border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px 3px; margin-bottom: 10px; }
.grp-t { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink3); margin-bottom: 8px; }
.hint { font-size: 11.5px; color: var(--ink3); line-height: 1.6; margin-bottom: 12px; }
.hint code, .auto-k { font-family: 'IBM Plex Mono', monospace; color: var(--data); font-size: 10.5px; }
.auto-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.auto-k { min-width: 56px; flex-shrink: 0; }
.auto-card { border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; margin-bottom: 7px; }
.auto-card.off { opacity: .5; }
.auto-card .auto-row { margin-bottom: 4px; }
.auto-adv { display: flex; gap: 10px; flex-wrap: wrap; }
.auto-adv label { font-size: 10px; color: var(--ink3); display: flex; align-items: center; gap: 4px; }
.auto-adv .numin { width: 52px; }
.auto-row.browse { gap: 5px; }
.an-who { font-size: 10.5px; color: var(--ink3); max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; flex-shrink: 0; }
.an-who:hover { color: var(--acc); }
.an-exp { font-size: 10px; color: var(--data); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; text-align: right; }
.anlive { color: var(--data); flex-shrink: 0; }
.grp-t { display: flex; align-items: center; gap: 5px; }
.tabs button { display: inline-flex; align-items: center; gap: 4px; }
.addfx { margin-bottom: 10px; }
.fxcard { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
.fxcard.off { opacity: .5; }
.fx-h { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.fx-n { font-size: 12px; font-weight: 600; }
.empty { color: var(--ink3); font-size: 12px; line-height: 1.7; padding: 14px 4px; }
.empty b, .hint b { color: var(--acc); font-weight: 600; }
.ib.tiny { width: 24px; height: 24px; flex-shrink: 0; }
.tin { flex: 1; min-width: 0; }
</style>
