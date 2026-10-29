/* store.js — reactive bridge between the Vue UI and the Vlexyna engine */
import { reactive } from 'vue';

export const S = reactive({
  booted: false, rev: 0, tlRev: 0,
  vx: null,                 /* window.VX, set at boot */
  time: 0, dur: 30, playing: false, fps: 0,
  name: 'Untitled', width: 1920, height: 1080, fpsProj: 60,
  sel: null, tab: 'props',
  tlZoom: 80, tlSnap: true,
  modal: null,              /* { type, ...payload } */
  menu: null,               /* { x, y, items, wide } */
  toasts: [],
  audio: { name: '', has: false, micOn: false, muted: false, vol: .9 },
  bands: { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 },
  exporting: false, expProg: 0, expLabel: '',
  canUndo: false, canRedo: false, savedFlash: 0,
});

export const touch = () => { S.rev++; };
export const touchTl = () => { S.tlRev++; S.rev++; };

let toastN = 0;
export function toast(msg, kind) {
  const id = ++toastN;
  S.toasts.push({ id, msg, kind });
  setTimeout(() => { const i = S.toasts.findIndex(t => t.id === id); if (i >= 0) S.toasts.splice(i, 1); }, 3400);
}

export function openModal(type, payload) { S.modal = { type, ...(payload || {}) }; }
export function closeModal(fireClose = true) {
  if (!S.modal) return;
  const onClose = S.modal.onClose;
  S.modal = null;
  if (fireClose && onClose) onClose();
}
export function openMenu(ev, items, opts = {}) {
  const x = (ev && typeof ev === 'object' && 'clientX' in ev) ? ev.clientX : (typeof ev === 'number' ? ev : 0);
  const y = (ev && typeof ev === 'object' && 'clientY' in ev) ? ev.clientY : 0;
  S.menu = { x, y, items, wide: !!opts.wide };
}
export function closeMenu() { S.menu = null; }

export function confirmDlg(msg, onYes, yesLabel) { openModal('confirm', { msg, onYes, yesLabel }); }
export function promptDlg(msg, def, onOk) { openModal('prompt', { msg, def, onOk }); }

/* pull engine → store */
export function syncAll() {
  const VX = S.vx;
  if (!VX || !VX.project.current) return;
  const p = VX.project.current;
  S.name = p.name; S.width = p.width; S.height = p.height; S.fpsProj = p.fps;
  const eng = VX.audio.engine;
  S.audio.name = eng.name || ''; S.audio.has = !!eng.buffer;
  S.audio.micOn = !!VX.app?.micOn; S.audio.muted = !!VX.app?.muted;
  S.audio.vol = eng.volume ?? .9;
  S.canUndo = VX.project.undoStack.length >= 2;
  S.canRedo = VX.project.redoStack.length > 0;
  S.dur = VX.app ? VX.app.duration() : 30;
  touch(); touchTl();
}
export function syncTransport() {
  const VX = S.vx;
  if (!VX) return;
  S.playing = !!VX.app?.playing;
  S.audio.name = VX.audio.engine.name || '';
  S.audio.has = !!VX.audio.engine.buffer;
  S.audio.micOn = !!VX.app?.micOn;
  S.audio.muted = !!VX.app?.muted;
}

export const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), cs = Math.floor((s % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};
export const layers = () => (S.vx && S.vx.project.current ? S.vx.project.current.layers : []);
export const selLayer = () => layers().find(l => l.id === S.sel) || null;
