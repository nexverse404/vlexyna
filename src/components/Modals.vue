<script setup>
import { ref, computed, watch } from 'vue';
import { S, closeModal, toast, confirmDlg, syncAll, fmtTime, touch } from '../store.js';
import { loadDemo } from '../appctl.js';
import { U } from '../../engine/util.js';

const M = computed(() => S.modal);

/* ───────── export ───────── */
const exp = ref({ includeAudio: true, monitor: false, bitrate: 16, fps: 60 });
const canAudio = computed(() => S.audio.has);
function startExport() {
  const VX = S.vx;
  if (S.exporting) return;
  S.exporting = true; S.expProg = 0; S.expLabel = 'Starting…';
  VX.app.onExportProgress = (p, t, dur) => { S.expProg = p; S.expLabel = `${fmtTime(t)} / ${fmtTime(dur)}`; };
  Promise.resolve(VX.exporter.exportVideo({
    includeAudio: exp.value.includeAudio && canAudio.value,
    monitor: exp.value.monitor,
    bitrate: exp.value.bitrate * 1e6,
    fps: exp.value.fps,
  })).finally(() => { S.exporting = false; VX.app.onExportProgress = null; syncAll(); });
  toast('Recording in real time — sit back');
}
function cancelExport() { S.vx.exporter.cancel(); }

/* ───────── templates ───────── */
const templates = computed(() => S.vx ? S.vx.templates.list : []);
function applyTemplate(t) { S.vx.templates.apply(t); closeModal(); S.sel = null; }

/* ───────── projects ───────── */
const LS_KEY = 'vlexyna_projects_v1';
const projects = ref([]);
const prName = ref('');
watch(() => S.modal?.type, (t) => { if (t === 'projects') refreshProjects(); }, { immediate: true });
function refreshProjects() { projects.value = S.vx ? S.vx.project.list() : []; }
function openProject(id) {
  if (S.vx.project.open(id)) { S.sel = null; syncAll(); closeModal(); toast('Project opened'); }
  else toast('Could not open project', 'err');
}
function renameProject(p) {
  S.modal = {
    type: 'prompt', msg: `Rename “${p.name}”`, def: p.name,
    onOk: (v) => {
      if (!v?.trim()) return;
      try {
        const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
        if (all[p.id]) { all[p.id].name = v.trim(); localStorage.setItem(LS_KEY, JSON.stringify(all)); }
        if (S.vx.project.current.id === p.id) { S.vx.project.current.name = v.trim(); syncAll(); }
        refreshProjects();
      } catch (e) { toast('Rename failed', 'err'); }
    },
  };
}
function delProject(id) {
  confirmDlg('Delete this project permanently?', () => {
    S.vx.project.remove(id); refreshProjects(); toast('Project deleted');
  }, 'Delete');
}
function newProject() {
  S.vx.project.newProject(prName.value || 'Untitled');
  S.sel = null; syncAll(); refreshProjects(); toast('New project created');
}
function importVlx() {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = '.vlx,application/json';
  i.onchange = async () => {
    if (!i.files[0]) return;
    await S.vx.project.importFile(i.files[0]);
    S.sel = null; syncAll(); refreshProjects(); closeModal();
  };
  i.click();
}
function exportVlx() { S.vx.project.exportFile(); toast('Project exported as .vlx'); }

/* ───────── lyrics ───────── */
const lyrLayer = computed(() => S.modal?.layer || null);
const lyrText = ref('');
const lyrTa = ref(null);
watch(() => S.modal?.type, (t) => {
  if (t === 'lyrics' && lyrLayer.value) {
    lyrText.value = linesToText(lyrLayer.value.props.lines || []);
  }
}, { immediate: true });
const linesToText = (lines) => lines.map(l => (l.t == null ? '' : `[${fmtTime(l.t).slice(0, 8)}] `) + l.text).join('\n');
function saveLyrics() {
  const VX = S.vx, layer = lyrLayer.value;
  const raw = VX.layers.parseLRC(lyrText.value);
  const timed = raw.filter(l => l.t != null), untimed = raw.filter(l => l.t == null);
  layer.props.lines = [...timed, ...untimed];
  VX.project.snapshot('edit lyrics');
  touch();
  toast(`Lyrics saved — ${raw.length} lines (${untimed.length} untimed)`);
}
/* insert a [mm:ss.cc] stamp from the playhead at the text cursor */
function tapSync() {
  const ta = lyrTa.value;
  const stamp = `[${fmtTime(S.time).slice(0, 8)}] `;
  const pos = ta?.selectionStart ?? lyrText.value.length;
  lyrText.value = lyrText.value.slice(0, pos) + stamp + lyrText.value.slice(pos);
  if (ta) { const p = pos + stamp.length; requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(p, p); }); }
  toast(`Stamped ${fmtTime(S.time)} — cursor marked`);
}
function importLyrics(e) {
  const f = e.target.files[0];
  if (!f) return;
  U.readText(f).then(txt => {
    const ls = f.name.toLowerCase().endsWith('ttml') ? S.vx.layers.parseTTML(txt) : S.vx.layers.parseLRC(txt);
    lyrText.value = linesToText(ls);
    toast(`Parsed ${ls.length} lines from ${f.name}`);
  });
}

/* ───────── custom size ───────── */
const cs = ref({ w: 1920, h: 1080 });
const CS_PRESETS = [['1920', '1080', '16:9'], ['1080', '1920', '9:16'], ['1080', '1080', '1:1'], ['1280', '720', '720p'], ['2560', '1440', '1440p'], ['3840', '2160', '4K']];
function applySize() {
  const w = Math.round(+cs.value.w), h = Math.round(+cs.value.h);
  if (!(w >= 16 && w <= 7680 && h >= 16 && h <= 4320)) { toast('Size must be 16–7680 px per side', 'warn'); return; }
  const VX = S.vx;
  VX.project.current.width = w; VX.project.current.height = h;
  VX.project.snapshot('canvas size');
  syncAll(); closeModal();
}

/* ───────── automation editor ───────── */
const autoExpr = ref('');
const autoErr = computed(() => {
  if (!S.vx || !autoExpr.value.trim()) return '';
  const err = S.vx.expr.check(autoExpr.value.trim());
  return err ? `⚠ ${err}` : '✓ expression valid';
});
watch(() => S.modal?.type, (t) => {
  if (t === 'auto') {
    const l = S.vx.project.current.layers.find(x => x.id === S.modal.layer);
    autoExpr.value = l?.auto?.[S.modal.key] || '';
  }
}, { immediate: true });
function saveAuto() {
  const VX = S.vx;
  const l = VX.project.current.layers.find(x => x.id === S.modal.layer);
  if (l) {
    if (autoExpr.value.trim()) {
      l.auto = l.auto || {};
      l.auto[S.modal.key] = autoExpr.value.trim();
    } else if (l.auto) delete l.auto[S.modal.key];
    VX.project.autosave();
    touch();
  }
  closeModal();
}

/* ───────── prompt / confirm ───────── */
const promptVal = ref('');
watch(() => S.modal, (mm) => { if (mm?.type === 'prompt') promptVal.value = mm.def ?? ''; }, { immediate: true });
function confirmYes() { const yes = S.modal?.onYes; closeModal(false); yes && yes(); }
function promptOk() { const ok = S.modal?.onOk; const v = promptVal.value; closeModal(false); ok && ok(v); }

/* ───────── welcome ───────── */
async function welcomeDemo() { closeModal(); await loadDemo(); }
function welcomeTemplates() { S.modal = { type: 'templates' }; }
</script>

<template>
  <Teleport to="body">
    <div class="modal-wrap" v-if="M" @pointerdown.self="!S.exporting && closeModal()">
      <div class="modal" :class="'m-' + M.type">

        <!-- WELCOME -->
        <template v-if="M.type === 'welcome'">
          <div class="w-hero">
            <svg viewBox="0 0 32 32" width="54" height="54" aria-hidden="true">
              <defs><linearGradient id="wlg" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#7c5cff"/>
              </linearGradient></defs>
              <path d="M5 26V14M11 26V6M17 26v-11M23 26V10M28 26v-7" stroke="url(#wlg)" stroke-width="3" stroke-linecap="round" fill="none"/>
            </svg>
            <h2>Vlexyna</h2>
            <p class="w-sub">Music visualizer studio — {{ S.vx?.fx?.list?.length || 64 }} effects, {{ S.vx?.layers?.list?.length || 20 }} layer types, and everything reacts to your sound.</p>
          </div>
          <div class="w-actions">
            <button class="btn primary big" @click="welcomeDemo"><span v-html="U.icon('spark', 15)"></span>Try it — demo beat</button>
            <button class="btn big" @click="welcomeTemplates"><span v-html="U.icon('template', 15)"></span>Browse {{ templates.length }} templates</button>
            <button class="btn big" @click="closeModal()"><span v-html="U.icon('shape', 15)"></span>Start blank</button>
          </div>
          <p class="w-hint">Drop an MP3 anywhere, anytime. Press <b>?</b> for shortcuts.</p>
        </template>

        <!-- TEMPLATES -->
        <template v-else-if="M.type === 'templates'">
          <div class="m-h"><h3>Templates</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <div class="tpl-grid">
            <button v-for="t in templates" :key="t.name" class="tpl" @click="applyTemplate(t)">
              <span class="tpl-art"><span class="tpl-bars"><i v-for="i in 5" :key="i"></i></span></span>
              <span class="tpl-name">{{ t.name }}</span>
              <span class="tpl-desc">{{ t.desc }}</span>
              <span class="tpl-n lab">{{ t.layers.length }} layers</span>
            </button>
          </div>
        </template>

        <!-- PROJECTS -->
        <template v-else-if="M.type === 'projects'">
          <div class="m-h"><h3>Projects</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <div class="proj-new">
            <input class="tin" v-model="prName" placeholder="New project name…" @keydown.enter="newProject">
            <button class="btn" @click="newProject"><span v-html="U.icon('add', 13)"></span>New</button>
            <button class="btn" @click="importVlx"><span v-html="U.icon('folder', 13)"></span>Import .vlx</button>
            <button class="btn" @click="exportVlx"><span v-html="U.icon('export', 13)"></span>Export .vlx</button>
          </div>
          <div class="proj-list">
            <div v-for="p in projects" :key="p.id" class="proj">
              <span class="proj-n">{{ p.name }}</span>
              <span class="lab">{{ p.layers }} layers · {{ new Date(p.updated).toLocaleString() }}</span>
              <div class="spacer"></div>
              <button class="btn small" @click="openProject(p.id)">Open</button>
              <button class="ib" @click="renameProject(p)" v-html="U.icon('edit', 14)"></button>
              <button class="ib danger" @click="delProject(p.id)" v-html="U.icon('trash', 14)"></button>
            </div>
            <p class="empty" v-if="!projects.length">No saved projects yet — one is created automatically when you add layers.</p>
          </div>
        </template>

        <!-- EXPORT -->
        <template v-else-if="M.type === 'export'">
          <div class="m-h"><h3>Export video</h3><button class="ib" v-if="!S.exporting" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <template v-if="!S.exporting">
            <div class="x-row"><span>Canvas</span><b class="mono">{{ S.width }} × {{ S.height }} @ {{ S.fpsProj }} fps</b></div>
            <div class="x-row"><span>Duration</span><b class="mono">{{ fmtTime(S.dur) }}</b></div>
            <div class="x-row"><span>Audio track</span>
              <label class="sw-row"><input type="checkbox" v-model="exp.includeAudio" :disabled="!canAudio"> include audio</label>
            </div>
            <div class="x-row"><span>Monitor sound</span>
              <label class="sw-row"><input type="checkbox" v-model="exp.monitor"> hear while recording</label>
            </div>
            <div class="x-row"><span>Bitrate</span>
              <select v-model.number="exp.bitrate"><option :value="8">8 Mbps — small</option><option :value="16">16 Mbps — balanced</option><option :value="32">32 Mbps — pristine</option></select>
            </div>
            <div class="x-row"><span>Frame rate</span>
              <select v-model.number="exp.fps"><option :value="30">30 fps</option><option :value="60">60 fps</option></select>
            </div>
            <p class="hint">Records in real time with your browser's native encoder — WebM in Firefox, MP4 (H.264) in Chrome where supported.</p>
            <button class="btn primary big wide" @click="startExport"><span v-html="U.icon('export', 15)"></span>Start recording</button>
          </template>
          <template v-else>
            <div class="x-prog"><div class="x-bar" :style="{ width: (S.expProg * 100).toFixed(1) + '%' }"></div></div>
            <div class="x-lab"><span class="mono">{{ S.expLabel }}</span><span class="mono">{{ Math.round(S.expProg * 100) }}%</span></div>
            <button class="btn danger big wide" @click="cancelExport">Cancel</button>
          </template>
        </template>

        <!-- HELP -->
        <template v-else-if="M.type === 'help'">
          <div class="m-h"><h3>Help & shortcuts</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <div class="help-cols">
            <div>
              <h4>Playback</h4>
              <div class="sc"><span>Space</span> play / pause</div>
              <div class="sc"><span>L</span> loop on / off</div>
              <div class="sc"><span>M</span> live microphone mode</div>
              <h4>Editing</h4>
              <div class="sc"><span>Ctrl+Z / +Shift</span> undo / redo</div>
              <div class="sc"><span>Ctrl+D</span> duplicate layer</div>
              <div class="sc"><span>Delete</span> remove layer</div>
              <div class="sc"><span>Arrows</span> nudge (Shift = 10×)</div>
              <div class="sc"><span>Dbl-click name</span> rename</div>
            </div>
            <div>
              <h4>View & output</h4>
              <div class="sc"><span>F</span> fullscreen preview</div>
              <div class="sc"><span>P</span> save frame as PNG</div>
              <div class="sc"><span>E</span> export video</div>
              <div class="sc"><span>T</span> templates</div>
              <div class="sc"><span>?</span> this dialog</div>
              <h4>Good to know</h4>
              <p class="hint">Drop audio, images, video, LRC/TTML lyrics or .vlx projects anywhere. <b>ƒ</b> beside a slider binds it to the music — try <code>beat</code> or <code>bass*2</code>. Timeline clips drag to move, edges trim. Right-click layers and effects for more.</p>
            </div>
          </div>
        </template>

        <!-- LYRICS -->
        <template v-else-if="M.type === 'lyrics'">
          <div class="m-h"><h3>Lyrics — {{ lyrLayer?.name }}</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <p class="hint">One line per lyric, timestamps as <code>[mm:ss.cc]</code>. Press <b>Stamp time</b> (or click in the text first) to drop the playhead time at the cursor while the music plays. Untimed lines inherit the previous line's rhythm.</p>
          <textarea ref="lyrTa" class="lyr mono" v-model="lyrText" spellcheck="false"
                    placeholder="[00:12.50] first line&#10;[00:16.10] second line"></textarea>
          <div class="m-foot">
            <label class="btn small">
              <span v-html="U.icon('folder', 12)"></span>Import LRC/TTML
              <input type="file" accept=".lrc,.ttml,.txt" class="hide" @change="importLyrics">
            </label>
            <div class="spacer"></div>
            <button class="btn small" @click="tapSync"><span v-html="U.icon('clockIcon', 12)"></span>Stamp {{ fmtTime(S.time).slice(0, 8) }}</button>
            <button class="btn small primary" @click="saveLyrics"><span v-html="U.icon('check', 13)"></span>Save</button>
          </div>
        </template>

        <!-- AUTOMATION -->
        <template v-else-if="M.type === 'auto'">
          <div class="m-h"><h3>Automate “{{ M.key }}”</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <p class="hint">An expression added to the base value every frame. Try <code>beat*0.3</code>, <code>bass</code>, <code>sin(t*2)*0.2</code>, <code>fft(80,200)</code>, <code>freq(0)</code>. Empty removes the automation.</p>
          <input class="tin mono big-in" v-model="autoExpr" placeholder="e.g. beat*0.3" autofocus @keydown.enter="saveAuto">
          <p class="hint auto-err" v-if="autoExpr.trim()">{{ autoErr }}</p>
          <div class="m-foot"><button class="btn primary" @click="saveAuto">Apply</button></div>
        </template>

        <!-- CUSTOM SIZE -->
        <template v-else-if="M.type === 'customsize'">
          <div class="m-h"><h3>Custom canvas size</h3><button class="ib" @click="closeModal()" v-html="U.icon('close')"></button></div>
          <div class="cs-presets">
            <button v-for="p in CS_PRESETS" :key="p[2]" class="btn small" @click="cs.w = +p[0]; cs.h = +p[1]">{{ p[2] }}</button>
          </div>
          <div class="x-row"><span>Width</span><input class="numin mono" type="number" v-model.number="cs.w" min="16" max="7680"></div>
          <div class="x-row"><span>Height</span><input class="numin mono" type="number" v-model.number="cs.h" min="16" max="4320"></div>
          <div class="m-foot"><button class="btn primary" @click="applySize">Apply</button></div>
        </template>

        <!-- CONFIRM / PROMPT -->
        <template v-else-if="M.type === 'confirm'">
          <p class="c-msg">{{ M.msg }}</p>
          <div class="m-foot">
            <button class="btn" @click="closeModal(false)">Cancel</button>
            <button class="btn danger" @click="confirmYes">{{ M.yesLabel || 'Confirm' }}</button>
          </div>
        </template>
        <template v-else-if="M.type === 'prompt'">
          <p class="c-msg">{{ M.msg }}</p>
          <input class="tin" v-model="promptVal" autofocus @keydown.enter="promptOk">
          <div class="m-foot">
            <button class="btn" @click="closeModal(false)">Cancel</button>
            <button class="btn primary" @click="promptOk">OK</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-wrap { position: fixed; inset: 0; background: rgba(4, 5, 8, .72); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal {
  background: var(--bg2); border: 1px solid var(--line2); border-radius: 12px;
  width: min(92vw, 720px); max-height: 86vh; overflow-y: auto; padding: 18px 20px;
}
.m-welcome { width: min(92vw, 520px); text-align: center; padding: 34px 30px; }
.m-auto, .m-confirm, .m-prompt, .m-customsize { width: min(92vw, 440px); }
.m-export { width: min(92vw, 520px); }
.m-h { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.m-h h3 { font-size: 16px; font-weight: 700; flex: 1; }
.m-foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.spacer { flex: 1; }

.w-hero h2 { font-size: 26px; font-weight: 800; letter-spacing: -.01em; margin: 12px 0 6px; }
.w-sub { color: var(--ink3); font-size: 13px; line-height: 1.6; max-width: 360px; margin: 0 auto 22px; }
.w-actions { display: flex; flex-direction: column; gap: 9px; }
.w-hint { color: var(--ink3); font-size: 11.5px; margin-top: 20px; }
.w-hint b { color: var(--acc); }

.tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.tpl {
  display: flex; flex-direction: column; gap: 3px; text-align: left; cursor: pointer;
  background: var(--panel); border: 1px solid var(--line); border-radius: 9px; padding: 9px;
  color: var(--ink2); font-family: inherit;
}
.tpl:hover { border-color: var(--acc); }
.tpl-art { height: 60px; border-radius: 6px; background: linear-gradient(160deg, #14161c, #0c0d12); margin-bottom: 5px; display: flex; align-items: flex-end; justify-content: center; padding: 8px; }
.tpl-bars { display: flex; align-items: flex-end; gap: 3px; height: 100%; }
.tpl-bars i { width: 5px; background: rgba(34, 211, 238, .5); border-radius: 2px; animation: bar 1.1s ease-in-out infinite; }
.tpl-bars i:nth-child(1) { height: 40%; animation-delay: 0s; }
.tpl-bars i:nth-child(2) { height: 70%; animation-delay: .15s; }
.tpl-bars i:nth-child(3) { height: 100%; animation-delay: .3s; }
.tpl-bars i:nth-child(4) { height: 60%; animation-delay: .45s; }
.tpl-bars i:nth-child(5) { height: 35%; animation-delay: .6s; }
@keyframes bar { 50% { transform: scaleY(.45); } }
.tpl-name { font-weight: 700; font-size: 12.5px; color: var(--ink); }
.tpl-desc { font-size: 11px; color: var(--ink3); line-height: 1.4; min-height: 30px; }
.tpl-n { color: var(--ink3); }

.proj-new { display: flex; gap: 8px; margin-bottom: 12px; }
.proj-new .tin { flex: 1; min-width: 0; }
.proj-list { display: flex; flex-direction: column; gap: 4px; }
.proj { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
.proj-n { font-weight: 600; font-size: 12.5px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { color: var(--ink3); font-size: 12px; padding: 14px 4px; }
.hint { font-size: 11.5px; color: var(--ink3); line-height: 1.65; margin-bottom: 10px; }
.hint code { font-family: 'IBM Plex Mono', monospace; color: var(--data); font-size: 10.5px; }
.hint b { color: var(--acc); }

.x-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 12.5px; color: var(--ink2); gap: 10px; }
.sw-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink3); cursor: pointer; }
.x-prog { height: 8px; background: var(--panel2); border-radius: 5px; overflow: hidden; margin: 18px 0 8px; }
.x-bar { height: 100%; background: var(--acc); transition: width .2s; }
.x-lab { display: flex; justify-content: space-between; color: var(--ink3); font-size: 11.5px; margin-bottom: 16px; }
.wide { width: 100%; }
.big { padding: 10px 16px; font-size: 13px; }

.help-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.help-cols h4 { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink3); margin: 14px 0 8px; }
.sc { display: flex; gap: 10px; align-items: baseline; font-size: 12px; color: var(--ink2); margin-bottom: 6px; }
.sc span { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: var(--ink); background: var(--panel2); border: 1px solid var(--line2); border-radius: 4px; padding: 1px 6px; white-space: nowrap; }

.lyr { width: 100%; min-height: 300px; resize: vertical; font-size: 12px; line-height: 1.8; white-space: pre; }
.hide { display: none; }
.big-in { font-size: 13px; padding: 8px 10px; }
.auto-err { margin: 8px 0 0; }
.c-msg { font-size: 13px; color: var(--ink2); line-height: 1.6; }
.cs-presets { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
</style>
