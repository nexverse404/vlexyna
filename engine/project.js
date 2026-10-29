/* Vlexyna — project.js — project model, undo/redo, persistence */
'use strict';
import { VX, U } from './util.js';
(() => {
  const PR = VX.project = {};
  const LS_KEY = 'vlexyna_projects_v1';
  const LS_LAST = 'vlexyna_last_v1';

  PR.blank = () => ({
    id: U.uid(), name: 'Untitled', width: 1920, height: 1080, fps: 60,
    layers: [], post: [], vars: { v1: 0, v2: 0, v3: 0, v4: 0 },
    camera: { on: false, zoom: 1, x: 0, y: 0, rot: 0, zoomBass: 0, zoomBeat: 0, rotBeat: 0, shake: 0, shakeBeat: 0, rotShake: 1 },
    duration: 30, audioName: '', updated: Date.now()
  });
  const CAM_DEFAULTS = { on: false, zoom: 1, x: 0, y: 0, rot: 0, zoomBass: 0, zoomBeat: 0, rotBeat: 0, shake: 0, shakeBeat: 0, rotShake: 1 };
  PR.ensureCamera = (p) => {
    if (!p) return p;
    if (!p.camera || typeof p.camera.on !== 'boolean') p.camera = { ...CAM_DEFAULTS, ...(p.camera || {}) };
    return p;
  };

  PR.current = null;
  PR.undoStack = []; PR.redoStack = [];
  PR._saveWarned = false;

  const serialize = (proj) => JSON.stringify(proj, (k, v) => {
    if (k.startsWith('_') && k !== '_seed') return undefined;
    return v;
  });

  PR.snapshot = (label) => {
    if (!PR.current) return;
    const snap = serialize(PR.current);
    if (PR.undoStack.length && PR.undoStack[PR.undoStack.length - 1].data === snap) return;
    PR.undoStack.push({ data: snap, label: label || '' });
    if (PR.undoStack.length > 60) PR.undoStack.shift();
    PR.redoStack.length = 0;
    PR.autosave();
    VX.ui && VX.ui.updateUndo();
  };
  PR.undo = () => {
    if (PR.undoStack.length < 2) return;
    const cur = PR.undoStack.pop();
    PR.redoStack.push(cur);
    const prev = PR.undoStack[PR.undoStack.length - 1];
    PR.restore(prev.data);
    U.toast(`Undo — ${cur.label || 'change'}`);
    VX.ui && VX.ui.updateUndo();
  };
  PR.redo = () => {
    const nxt = PR.redoStack.pop();
    if (!nxt) return;
    PR.undoStack.push(nxt);
    PR.restore(nxt.data);
    U.toast(`Redo — ${nxt.label || 'change'}`);
    VX.ui && VX.ui.updateUndo();
  };
  PR.restore = (data) => {
    const wasPlaying = VX.app.playing;
    VX.app.pause();
    const id = PR.current ? PR.current.id : null;
    PR.current = JSON.parse(data);
    PR.current.id = id || PR.current.id;
    PR.current.updated = Date.now();
    PR.ensureCamera(PR.current);
    VX.ui && VX.ui.refreshAll();
    if (wasPlaying) VX.app.play();
    PR.autosave();
  };

  /* ---------- localStorage projects ---------- */
  const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } };
  const lsWrite = (o) => { localStorage.setItem(LS_KEY, JSON.stringify(o)); };

  PR.autosave = U.debounce(() => PR.saveNow(), 900);
  PR.saveNow = () => {
    if (!PR.current) return;
    PR.current.updated = Date.now();
    const all = lsRead();
    all[PR.current.id] = { name: PR.current.name, updated: PR.current.updated, data: serialize(PR.current) };
    try {
      lsWrite(all);
      localStorage.setItem(LS_LAST, PR.current.id);
      VX.ui && VX.ui.updateSaved();
    } catch (e) {
      if (!PR._saveWarned) { PR._saveWarned = true; U.toast('Project too large for browser storage — export it as a .vlx file to keep it', 'warn'); }
    }
  };
  PR.list = () => Object.entries(lsRead()).map(([id, r]) => ({ id, name: r.name, updated: r.updated, layers: (() => { try { return JSON.parse(r.data).layers.length; } catch (e) { return 0; } })() })).sort((a, b) => b.updated - a.updated);
  PR.open = (id) => {
    const all = lsRead(), rec = all[id];
    if (!rec) return false;
    try { PR.current = JSON.parse(rec.data); } catch (e) { return false; }
    PR.current.id = id;
    PR.undoStack = [{ data: rec.data, label: 'open' }]; PR.redoStack = [];
    localStorage.setItem(LS_LAST, id);
    VX.ui && VX.ui.refreshAll();
    VX.app.time = 0; VX.app.pause();
    return true;
  };
  PR.remove = (id) => { const all = lsRead(); delete all[id]; lsWrite(all); };
  PR.newProject = (name) => {
    PR.current = PR.blank();
    if (name) PR.current.name = name;
    PR.undoStack = [{ data: serialize(PR.current), label: 'new' }]; PR.redoStack = [];
    VX.ui && VX.ui.refreshAll();
    PR.saveNow();
  };

  /* ---------- .vlx file export/import ---------- */
  PR.exportFile = (includeAudio) => {
    const data = JSON.parse(serialize(PR.current));
    data.app = 'Vlexyna';
    data.version = 1;
    data.assets = VX.assets.serialize();
    if (includeAudio && VX.audio.engine.buffer) {
      data.audioNote = 'Audio is not embedded — re-attach your audio file after import.';
    }
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    U.download(blob, (PR.current.name || 'project').replace(/[^\w\- ]+/g, '') + '.vlx');
  };
  PR.importFile = async (file) => {
    let data;
    try { data = JSON.parse(await U.readText(file)); } catch (e) { U.toast('Not a valid .vlx project file', 'err'); return; }
    if (!data.layers) { U.toast('Not a valid .vlx project file', 'err'); return; }
    if (data.assets) VX.assets.load(data.assets);
    delete data.assets; delete data.audioNote;
    data.id = U.uid();
    data.name = (data.name || 'Imported') + '';
    PR.current = data;
    PR.undoStack = [{ data: serialize(PR.current), label: 'import' }]; PR.redoStack = [];
    VX.ui && VX.ui.refreshAll();
    VX.app.time = 0; VX.app.pause();
    PR.saveNow();
    U.toast(`Imported "${data.name}"`);
  };

  PR.init = () => {
    const last = localStorage.getItem(LS_LAST);
    if (last && PR.open(last)) return;
    PR.newProject('Untitled');
  };
})();
