<script setup>
import { ref, computed } from 'vue';
import { S, openMenu, toast, touch, syncAll } from '../store.js';
import { U } from '../../engine/util.js';
import ParamControl from './ParamControl.vue';

/* ═════════ the Objects panel — routes by what is selected ═════════ */
const BLENDS = [
  ['source-over', 'Normal'], ['lighter', 'Add (glow)'], ['screen', 'Screen'], ['overlay', 'Overlay'],
  ['multiply', 'Multiply'], ['difference', 'Difference'], ['exclusion', 'Exclusion'], ['soft-light', 'Soft light'],
  ['hard-light', 'Hard light'], ['color-dodge', 'Dodge'], ['darken', 'Darken'], ['lighten', 'Lighten'],
  ['hue', 'Hue'], ['luminosity', 'Luminosity'],
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
const SIZES = [
  ['1920x1080', '1920 × 1080 · 16:9'], ['1280x720', '1280 × 720 · 16:9'],
  ['2560x1440', '2560 × 1440 · QHD'], ['3840x2160', '3840 × 2160 · 4K'],
  ['1080x1920', '1080 × 1920 · 9:16'], ['1080x1080', '1080 × 1080 · 1:1'], ['1080x1350', '1080 × 1350 · 4:5'],
];
const QUALS = [[360, '360p'], [480, '480p'], [720, '720p'], [1080, '1080p'], [0, 'Full']];

const selL = computed(() => {
  S.rev;
  if (!S.vx?.project?.current) return null;
  return S.vx.project.current.layers.find(l => l.id === S.sel) || null;
});
/* the tree routes the panel to a layer's effect or automation node */
const treeSel = computed(() => { S.rev; return S.treeSel && S.treeSel.layer === S.sel ? S.treeSel : null; });
const fxNode = computed(() => {
  const t = treeSel.value;
  if (!t || t.kind !== 'fx' || !selL.value) return null;
  return selL.value.fx?.[t.index] || null;
});
const autoNode = computed(() => {
  const t = treeSel.value;
  if (!t || t.kind !== 'auto' || !selL.value) return null;
  const a = selL.value.auto?.[t.key];
  return a === undefined ? null : { key: t.key, a };
});
const objTitle = computed(() => {
  if (fxNode.value) return fxName(fxNode.value.id);
  if (autoNode.value) return selL.value.name + ' · ' + autoNode.value.key;
  if (selL.value) return selL.value.name;
  return 'Composition';
});
const selDef = computed(() => (selL.value && S.vx.layers.byId[selL.value.type]) || null);
const genKey = computed(() => `${S.rev}:${S.sel}:${S.treeSel?.kind}:${S.treeSel?.index}:${S.treeSel?.key}`);

function get(o, k) { return () => o[k]; }
function set(o, k) {
  return (v, commit = true) => {
    o[k] = v;
    S.vx.renderer && S.vx.renderer.invalidate();
    if (commit) { S.vx.project.snapshot('edit ' + k); }
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
const fxName = (id) => S.vx?.fx?.byId[id]?.name || id;

/* ── composition object: canvas + camera ── */
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
  S.vx.renderer && S.vx.renderer.invalidate();
  touch();
}
function setSize(v) {
  const [w, h] = v.split('x').map(Number);
  const VX = S.vx;
  VX.project.current.width = w; VX.project.current.height = h;
  VX.project.snapshot('canvas size');
  syncAll();
}
function setProj(k, v) {
  const VX = S.vx;
  VX.project.current[k] = v;
  VX.project.snapshot(k);
  syncAll();
}

/* ── automation node editor ── */
const autoExprOf = (a) => typeof a === 'string' ? a : (a?.expr ?? '');
const autoEnabled = (a) => typeof a === 'string' ? true : (a?.enabled !== false);
function autoField(field, v) {
  const l = selL.value, k = autoNode.value?.key;
  if (!l || !k) return;
  const cur = l.auto[k];
  const base = typeof cur === 'string' ? { expr: cur } : (cur ? { ...cur } : { expr: '' });
  if (field === 'expr') base.expr = v; else base[field] = v === '' ? undefined : +v;
  const extras = ['min', 'max', 'smooth'].some(f => base[f] !== undefined) || base.enabled === false;
  l.auto[k] = extras ? base : (base.expr || '');
  S.vx.renderer && S.vx.renderer.invalidate();
  S.vx.project.snapshot('automation ' + k);
  touch();
}
function toggleAutoNode() {
  const l = selL.value, k = autoNode.value?.key;
  if (!l || !k) return;
  const a = l.auto[k];
  if (typeof a === 'string') l.auto[k] = { expr: a, enabled: false };
  else if (a) {
    a.enabled = !(a.enabled !== false);
    if (a.enabled === true && Object.keys(a).length === 2 && a.expr) l.auto[k] = a.expr;
  }
  S.vx.project.snapshot('toggle automation'); touch();
}
const autoErr = computed(() => {
  const e = autoExprOf(autoNode.value?.a || '');
  if (!e.trim() || !S.vx) return '';
  const err = S.vx.expr.check(e.trim());
  return err ? `⚠ ${err}` : '✓ expression valid';
});

/* ── fx node helpers ── */
function fxMenu(e, chain, i) {
  e.stopPropagation();
  const VX = S.vx;
  openMenu(e, [
    { label: chain[i].enabled ? 'Disable' : 'Enable', ic: chain[i].enabled ? 'eyeOff' : 'eye', fn: () => { chain[i].enabled = !chain[i].enabled; VX.project.autosave(); touch(); } },
    { label: 'Move up', ic: 'up', fn: () => { if (i > 0) { chain.splice(i - 1, 0, chain.splice(i, 1)[0]); VX.project.autosave(); touch(); } } },
    { label: 'Move down', ic: 'down', fn: () => { if (i < chain.length - 1) { chain.splice(i + 1, 0, chain.splice(i, 1)[0]); VX.project.autosave(); touch(); } } },
    { sep: '' },
    { label: 'Remove', ic: 'trash', danger: true, fn: () => { chain.splice(i, 1); S.treeSel = null; VX.project.snapshot('remove effect'); touch(); } },
  ]);
}
</script>

<template>
  <aside class="panel insp drawer side-r" :class="{ open: S.ui.right }">
    <div class="ph">
      <span class="ph-t">Objects / <b>{{ objTitle }}</b></span>
      <div class="spacer"></div>
      <div class="tabs" v-if="selL || fxNode || autoNode">
        <button class="on">Basics</button>
      </div>
      <button class="ib only-narrow" @click="S.ui.right = false" title="Close panel" v-html="U.icon('close')"></button>
    </div>

    <div class="pbody">
      <!-- ═══════ FX node ═════════ -->
      <template v-if="fxNode">
        <div :key="'fx' + genKey" class="fxcard">
          <div class="fx-h">
            <button class="ib tiny" @click="fxNode.enabled = !fxNode.enabled; S.vx.project.autosave(); S.vx.renderer.invalidate()" v-html="U.icon(fxNode.enabled ? 'eye' : 'eyeOff', 13)"></button>
            <span class="fx-n">{{ fxName(fxNode.id) }}</span>
            <span class="lab">on {{ selL.name }}</span>
            <div class="spacer"></div>
            <button class="ib tiny" @contextmenu="fxMenu($event, selL.fx, treeSel.index)" v-html="U.icon('list', 13)" title="Effect actions (right-click)"></button>
          </div>
          <div class="fx-p">
            <ParamControl v-for="p in (S.vx.fx.byId[fxNode.id]?.params || [])" :key="p.key" :param="p"
                          :get="() => fxNode.params[p.key]" :set="(v, c) => { fxNode.params[p.key] = v; S.vx.renderer.invalidate(); if (c) S.vx.project.autosave(); }" />
          </div>
        </div>
        <p class="hint">Effect on <b>{{ selL.name }}</b>. Reorder or remove via the button above; more effects in the Composition tree.</p>
      </template>

      <!-- ═══════ automation node ═════════ -->
      <template v-else-if="autoNode">
        <div :key="'au' + genKey" class="grp">
          <div class="grp-t">Automation — {{ autoNode.key }}</div>
          <p class="hint">An expression added to the base value every frame. Try <code>beat*0.3</code>, <code>bass</code>, <code>sin(t*2)*0.2</code>, <code>an('Analyzer 1')</code>.</p>
          <div class="ctl"><label class="ctl-l">Expression</label>
            <input class="tin mono" style="flex:1" :value="autoExprOf(autoNode.a)" spellcheck="false"
                   @change="autoField('expr', $event.target.value)"></div>
          <p class="hint mono" v-if="autoExprOf(autoNode.a).trim()">{{ autoErr }}</p>
          <ParamControl :param="{ t: 'bool', key: 'enabled', label: 'Enabled' }"
                        :get="() => autoEnabled(autoNode.a)" :set="(v) => toggleAutoNode()" />
          <div class="x3">
            <label>min <input class="numin mono" type="number" step="0.05" :value="typeof autoNode.a === 'object' && autoNode.a.min != null ? autoNode.a.min : ''"
                   @change="autoField('min', $event.target.value)"></label>
            <label>max <input class="numin mono" type="number" step="0.05" :value="typeof autoNode.a === 'object' && autoNode.a.max != null ? autoNode.a.max : ''"
                   @change="autoField('max', $event.target.value)"></label>
            <label>smooth <input class="numin mono" type="number" step="0.05" min="0" max="0.95" :value="typeof autoNode.a === 'object' && autoNode.a.smooth != null ? autoNode.a.smooth : ''"
                   @change="autoField('smooth', $event.target.value)"></label>
          </div>
          <button class="btn small danger" style="margin-top:8px" @click="delete selL.auto[autoNode.key]; S.treeSel = null; S.vx.project.snapshot('remove automation'); touch()">Remove automation</button>
        </div>
      </template>

      <!-- ═══════ layer object ═════════ -->
      <template v-else-if="selL">
        <div :key="'p' + genKey">
          <div class="grp">
            <div class="grp-t">General</div>
            <div class="ctl"><label class="ctl-l">Name</label>
              <input class="tin" style="flex:1" :value="selL.name" spellcheck="false"
                     @change="selL.name = $event.target.value || selL.name; S.vx.project.snapshot('rename layer'); touch()"></div>
            <div class="ctl"><label class="ctl-l">Item type</label><span class="mono muted">{{ S.vx.layers.byId[selL.type]?.name || selL.type }}</span></div>
          </div>
          <div class="grp">
            <div class="grp-t">Positioning &amp; size</div>
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

      <!-- ═══════ the composition itself ═════════ -->
      <template v-else>
        <div class="grp">
          <div class="grp-t">Project</div>
          <div class="ctl"><label class="ctl-l">Name</label>
            <input class="tin" style="flex:1" :value="S.name" spellcheck="false"
                   @change="S.vx.project.current.name = $event.target.value || 'Untitled'; S.vx.project.snapshot('rename'); syncAll()"></div>
          <div class="ctl"><label class="ctl-l">Resolution</label>
            <select :value="SIZES.some(s => s[0] === S.width + 'x' + S.height) ? S.width + 'x' + S.height : 'custom'" @change="setSize($event.target.value)" style="flex:1">
              <option v-for="s in SIZES" :key="s[0]" :value="s[0]">{{ s[1] }}</option>
              <option value="custom" disabled>Custom…</option>
            </select></div>
          <div class="ctl"><label class="ctl-l">Frame rate</label>
            <select :value="String(S.fpsProj)" @change="setProj('fps', +$event.target.value)" style="flex:1">
              <option value="24">24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option>
            </select></div>
          <div class="ctl"><label class="ctl-l">Preview quality</label>
            <select :value="String(S.vx?.app?.previewQuality ?? 720)" @change="S.vx.app.previewQuality = +$event.target.value; S.vx.renderer.invalidate()" style="flex:1">
              <option v-for="q in QUALS" :key="q[0]" :value="String(q[0])">{{ q[1] }}</option>
            </select></div>
        </div>
        <div class="grp">
          <div class="grp-t">Camera — moves with the music</div>
          <ParamControl v-for="cd in camDefs" :key="cd.key" :param="cd"
                        :get="() => camVal(cd.key)" :set="(v, c) => setCam(cd.key, v, c)" />
          <div class="btn-row wrap" style="margin-top:6px">
            <button class="btn small" @click="camPreset('punch')">Punch</button>
            <button class="btn small" @click="camPreset('breathe')">Breathe</button>
            <button class="btn small" @click="camPreset('quake')">Quake</button>
            <button class="btn small" @click="camPreset('off')">Off</button>
          </div>
        </div>
        <p class="hint">No object selected — these are the <b>composition</b> settings. Analyzers, effects, automations, media and projects live in the tabs on the left.</p>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.insp { grid-area: right; display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--line); }
@media (max-width: 1220px) { .insp { border-left: none; } }
.pbody { overflow-y: auto; flex: 1; padding: 10px 12px; }
.ph b { color: var(--acc-ink); font-weight: 600; }
.tabs { display: flex; gap: 2px; background: var(--bg); border: 1px solid var(--line); border-radius: 7px; padding: 2px; }
.tabs button {
  border: none; background: none; color: var(--ink); font-size: 11px; font-weight: 600;
  padding: 3px 10px; border-radius: 5px; cursor: pointer; font-family: inherit;
}
.grp { border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px 3px; margin-bottom: 10px; }
.grp-t { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink3); margin-bottom: 8px; }
.hint { font-size: 11.5px; color: var(--ink3); line-height: 1.6; margin-bottom: 12px; }
.hint code, .hint.mono { font-family: 'IBM Plex Mono', monospace; color: var(--data); font-size: 10.5px; }
.ctl { display: flex; align-items: center; gap: 8px; margin: 6px 0; min-height: 26px; }
.ctl-l { flex: 0 0 92px; color: var(--ink2); font-size: 12px; }
.x3 { display: flex; gap: 8px; flex-wrap: wrap; }
.x3 label { font-size: 10px; color: var(--ink3); display: flex; align-items: center; gap: 4px; }
.x3 .numin { width: 52px; }
.fxcard { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
.fx-h { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.fx-n { font-size: 12px; font-weight: 600; }
.ib.tiny { width: 24px; height: 24px; flex-shrink: 0; }
.tin { background: var(--bg2); border: 1px solid var(--line); border-radius: 6px; padding: 4px 7px; color: var(--ink); min-width: 0; }
</style>
