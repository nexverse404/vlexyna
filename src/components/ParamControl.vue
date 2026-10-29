<script setup>
import { computed } from 'vue';
import { S } from '../store.js';
import { U } from '../../engine/util.js';

/* One row per parameter definition — mirrors engine P.* schema exactly. */
const props = defineProps({
  param: Object,     /* { t, key, label, min, max, step, def, options, accept, fn } */
  get: Function,     /* () => value */
  set: Function,     /* (value, commit) => void */
  layer: Object,     /* owning layer (for ƒ automation), or null */
});

const opts = computed(() => typeof props.param.options === 'function' ? props.param.options() : props.param.options);
const val = computed(() => props.get());
const isAuto = computed(() => props.layer?.auto?.[props.param.key] != null);
const autoVal = computed(() => props.layer?.auto?.[props.param.key] || '');
const assetName = computed(() => {
  if (props.param.t !== 'file' || !S.vx) return '';
  const a = S.vx.assets.get(props.get());
  return a ? a.name : '';
});

function editAuto() {
  S.modal = { type: 'auto', layer: props.layer.id, key: props.param.key };
}
function commitNum(e) {
  let v = +e.target.value;
  if (props.param.min != null) v = Math.max(props.param.min, v);
  if (props.param.max != null) v = Math.min(props.param.max, v);
  props.set(v, true);
}
function onHex(e) {
  const v = e.target.value;
  if (/^#?[0-9a-fA-F]{3,8}$/.test(v)) props.set(v.startsWith('#') ? v : '#' + v, true);
  else e.target.value = props.get() || '';
}
function pickFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = props.param.accept || '*/*';
  inp.onchange = async () => {
    if (!inp.files[0]) return;
    const id = await S.vx.assets.addFile(inp.files[0]);
    props.set(id, true);
  };
  inp.click();
}
</script>

<template>
  <div class="ctl" :class="['ctl-' + param.t, { auto: isAuto }]">
    <div class="ctl-h" v-if="param.t !== 'act'">
      <label class="ctl-l">{{ param.label }}</label>
      <button v-if="param.t === 'num' && layer" class="autochip" :class="{ on: isAuto }"
              @click="editAuto" :title="isAuto ? 'Automated — click to edit' : 'Automate with music'">ƒ</button>
    </div>

    <div v-if="param.t === 'num'" class="ctl-v">
      <input type="range" :min="param.min" :max="param.max" :step="param.step ?? 0.01" :value="val"
             @input="set(+$event.target.value, false)" @change="set(+$event.target.value)">
      <input class="numin mono" type="number" :min="param.min" :max="param.max" :step="param.step ?? 0.01" :value="val"
             @change="commitNum">
    </div>

    <div v-else-if="param.t === 'color'" class="ctl-v">
      <input type="color" class="cin" :value="(val || '#000000').slice(0, 7)"
             @input="set($event.target.value, false)" @change="set($event.target.value)">
      <input class="hexin mono" :value="val" spellcheck="false" @change="onHex">
    </div>

    <div v-else-if="param.t === 'sel'" class="ctl-v">
      <select :value="String(val)" @change="set(opts[+$event.target.selectedIndex][0])">
        <option v-for="(o, i) in opts" :key="i" :value="String(o[0])">{{ o[1] }}</option>
      </select>
    </div>

    <div v-else-if="param.t === 'bool'" class="ctl-v">
      <button class="sw" :class="{ on: !!val }" role="switch" :aria-checked="!!val" @click="set(!val)"><span></span></button>
    </div>

    <div v-else-if="param.t === 'text'" class="ctl-v">
      <input class="tin" :value="val" spellcheck="false" @change="set($event.target.value)">
    </div>

    <textarea v-else-if="param.t === 'area'" class="ain mono" :value="val" spellcheck="false" rows="5"
              @change="set($event.target.value)"></textarea>

    <div v-else-if="param.t === 'file'" class="ctl-v">
      <button class="btn small" @click="pickFile">
        <span v-html="U.icon('folder', 12)"></span><span>{{ assetName ? assetName.slice(0, 24) : 'Choose file…' }}</span>
      </button>
    </div>

    <div v-else-if="param.t === 'act'" class="ctl-v">
      <button class="btn small" @click="param.fn(layer || S.vx.project.current)">{{ param.label }}</button>
    </div>

    <div v-if="isAuto" class="autoval mono">ƒ {{ autoVal }}</div>
  </div>
</template>

<style scoped>
.ctl { margin-bottom: 7px; display: block; }
.ctl-h { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.ctl-l { font-size: 11.5px; color: var(--ink3); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctl.auto .ctl-l { color: var(--data); }
.ctl-v { display: flex; align-items: center; gap: 7px; }
.ctl-v input[type='range'] { flex: 1; min-width: 0; }
.numin { width: 62px; text-align: right; flex-shrink: 0; }
.cin { width: 34px; height: 24px; padding: 0; border: 1px solid var(--line2); background: none; border-radius: 5px; cursor: pointer; flex-shrink: 0; }
.hexin { width: 82px; }
.tin, .ain { width: 100%; }
.ain { font-size: 11px; line-height: 1.5; resize: vertical; white-space: pre; }
.autochip {
  border: 1px solid var(--line2); background: none; color: var(--ink3);
  font-family: 'IBM Plex Mono', monospace; font-size: 11px; width: 18px; height: 18px;
  border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.autochip:hover { color: var(--data); border-color: var(--data); }
.autochip.on { background: rgba(34, 211, 238, .12); color: var(--data); border-color: var(--data); }
.autoval { font-size: 10.5px; color: var(--data); margin-top: 2px; }
</style>
