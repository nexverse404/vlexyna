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
const selDef = computed(() => (selL.value && S.vx.layers.byId[selL.value.type]) || null);
/* force controls to re-read values when the project itself changes (undo, template, import) */
const genKey = computed(() => `${S.rev}:${S.sel}:${tab.value}`);

function get(o, k) { return () => o[k]; }
function set(o, k) { return (v, commit = true) => { o[k] = v; if (commit) S.vx.project.autosave(); }; }

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
</script>

<template>
  <aside class="panel insp">
    <div class="ph">
      <span class="ph-t">Inspector</span>
      <div class="spacer"></div>
      <div v-if="selL" class="tabs">
        <button v-for="t in ['props', 'auto', 'fx']" :key="t" :class="{ on: tab === t }" @click="tab = t">
          {{ t === 'props' ? 'Layer' : t === 'auto' ? 'Auto' : 'Effects' }}
        </button>
      </div>
    </div>

    <div class="pbody">
      <!-- no selection: global post effects -->
      <template v-if="!selL">
        <p class="hint">No layer selected — editing <b>global post effects</b>, applied to the whole frame after all layers.</p>
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
        <p class="hint">Bind any property to the music — <code>bass</code>, <code>mid</code>, <code>treble</code>, <code>level</code>, <code>beat</code>, <code>t</code>, <code>freq(n)</code>, <code>fft(f0,f1)</code>. Evaluated every frame.</p>
        <div :key="'a' + genKey">
          <div v-for="(expr, k) in selL.auto || {}" :key="k" class="auto-row">
            <code class="auto-k">{{ k }}</code>
            <input class="tin mono" :value="expr" spellcheck="false"
                   @change="selL.auto[k] = $event.target.value; S.vx.project.autosave()">
            <button class="ib tiny" @click="delete selL.auto[k]; S.vx.project.autosave(); touch()" v-html="U.icon('close', 12)"></button>
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
