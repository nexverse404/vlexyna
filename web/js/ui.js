/* Vlexyna — ui.js — studio interface */
'use strict';
import { VX, U } from '../../engine/util.js';
(() => {
  const H = VX.ui = {};
  const P = VX.P;
  H.els = {};
  H.sel = null;
  H.tab = 'props';
  H.tlZoom = 80;
  H.tlSnap = true;
  H._scrubbing = false;

  const TRANSFORM_PARAMS = [
    P.num('x', 'Position X', 0, 1, .001, .5, { auto: true }),
    P.num('y', 'Position Y', 0, 1, .001, .5, { auto: true }),
    P.num('scale', 'Scale', 0, 4, .01, 1, { auto: true }),
    P.num('rotation', 'Rotation (°)', -720, 720, 1, 0, { auto: true }),
    P.num('opacity', 'Opacity', 0, 1, .01, 1, { auto: true }),
    P.sel('blend', 'Blend mode', [
      ['source-over', 'Normal'], ['lighter', 'Add (glow)'], ['screen', 'Screen'], ['overlay', 'Overlay'],
      ['multiply', 'Multiply'], ['difference', 'Difference'], ['exclusion', 'Exclusion'],
      ['soft-light', 'Soft light'], ['hard-light', 'Hard light'], ['color-dodge', 'Dodge'],
      ['darken', 'Darken'], ['lighten', 'Lighten'], ['hue', 'Hue'], ['luminosity', 'Luminosity']
    ], 'source-over'),
    P.sel('mirror', 'Mirror', [['none', 'None'], ['h', 'Horizontal'], ['v', 'Vertical'], ['quad', 'Quad']], 'none'),
  ];

  H.$ = (id) => document.getElementById(id);

  /* ================= INIT ================= */
  H.init = () => {
    const ids = ['projName', 'sizeSel', 'fpsSel', 'qualSel', 'undoBtn', 'redoBtn', 'tplBtn', 'projBtn', 'helpBtn',
      'snapBtn', 'exportBtn', 'fsBtn', 'fpsMeter', 'savedDot', 'addLayerBtn', 'layerList', 'preview', 'overlay',
      'playBtn', 'timeCur', 'seek', 'timeTotal', 'loopBtn', 'volSlider', 'muteBtn', 'micBtn', 'audioName',
      'loadAudioBtn', 'demoBtn', 'inspector', 'tabProps', 'tabAuto', 'tabFx', 'tlZoomIn', 'tlZoomOut', 'tlSnap',
      'tlScroll', 'tlContent', 'tlRuler', 'tlRows', 'playhead', 'stage', 'beatDot', 'projSettingsBtn'];
    for (const id of ids) H.els[id] = H.$(id);
    const E = H.els;

    /* topbar */
    const fillIcons = { undoBtn: 'undo', redoBtn: 'redo', tplBtn: 'template', projBtn: 'folder', snapBtn: 'camera', fsBtn: 'fullscreen', helpBtn: 'help', exportBtn: 'export', addLayerBtn: 'plus', loopBtn: 'loop', demoBtn: 'spark', loadAudioBtn: 'music', micBtn: 'mic' };
    for (const [id, ic] of Object.entries(fillIcons)) {
      const el = H.els[id] || H.$(id); if (!el) continue;
      const span = el.querySelector('.ic');
      if (span) span.innerHTML = U.icon(ic); else el.insertAdjacentHTML('afterbegin', U.icon(ic));
    }
    E.projName.addEventListener('change', () => { VX.project.current.name = E.projName.value || 'Untitled'; VX.project.snapshot('rename'); });
    E.sizeSel.addEventListener('change', () => {
      const v = E.sizeSel.value;
      if (v === 'custom') { H.openCustomSize(); return; }
      const [w, h] = v.split('x').map(Number);
      H.setSize(w, h);
    });
    E.fpsSel.addEventListener('change', () => { VX.project.current.fps = +E.fpsSel.value; VX.project.snapshot('fps'); });
    E.qualSel.addEventListener('change', () => { VX.app.previewQuality = +E.qualSel.value; });
    E.undoBtn.onclick = () => VX.project.undo();
    E.redoBtn.onclick = () => VX.project.redo();
    E.tplBtn.onclick = () => H.openTemplates();
    E.projBtn.onclick = () => H.openProjects();
    E.helpBtn.onclick = () => H.openHelp();
    E.snapBtn.onclick = () => VX.exporter.snapshotPNG();
    E.exportBtn.onclick = () => H.openExport();
    E.fsBtn.onclick = () => H.toggleFullscreen();

    /* transport */
    E.playBtn.onclick = () => VX.audio.engine.resume().then(() => VX.app.togglePlay());
    E.seek.addEventListener('input', () => { H._scrubbing = true; VX.app.seekTo(E.seek.value / 1000 * VX.app.duration()); });
    E.seek.addEventListener('change', () => { H._scrubbing = false; });
    E.loopBtn.onclick = () => { VX.app.loop = !VX.app.loop; VX.audio.engine.setLoop(VX.app.loop); H.updateTransport(); };
    E.volSlider.addEventListener('input', () => { VX.audio.engine.setVolume(+E.volSlider.value / 100); H.updateTransport(); });
    E.muteBtn.onclick = () => { VX.app.muted = !VX.app.muted; VX.audio.engine.setVolume(VX.app.muted ? 0 : +E.volSlider.value / 100); H.updateTransport(); };
    E.micBtn.onclick = async () => {
      if (VX.app.micOn) { VX.audio.engine.disableMic(); VX.app.micOn = false; U.toast('Microphone off'); }
      else { VX.app.micOn = await VX.audio.engine.enableMic(); if (VX.app.micOn) U.toast('Live mic mode — visuals react to your microphone'); }
      H.updateTransport();
    };
    E.loadAudioBtn.onclick = () => H.pickFile('audio/*', async f => { await H.loadAudioFile(f); });
    E.demoBtn.onclick = () => H.loadDemo();

    /* tabs */
    E.tabProps.onclick = () => H.setTab('props');
    E.tabAuto.onclick = () => H.setTab('auto');
    E.tabFx.onclick = () => H.setTab('fx');

    /* layers */
    E.addLayerBtn.onclick = (ev) => H.openLayerMenu(ev.currentTarget);

    /* timeline zoom */
    E.tlZoomIn.onclick = () => { H.tlZoom = Math.min(600, H.tlZoom * 1.4); H.refreshTimeline(); };
    E.tlZoomOut.onclick = () => { H.tlZoom = Math.max(12, H.tlZoom / 1.4); H.refreshTimeline(); };
    E.tlSnap.onclick = () => { H.tlSnap = !H.tlSnap; E.tlSnap.classList.toggle('on', H.tlSnap); };

    H.bindCanvasDrag();
    H.bindShortcuts();
    H.bindDnD();
    H.setTab('props');
    H.updateTransport();
    H.ready = true;
    H.fitStage();
  };

  /* fit preview canvas into the stage while keeping project aspect */
  H.fitStage = () => {
    if (!H.ready) return;
    const stage = E0('stage'), inner = E0('stageInner');
    const proj = VX.project.current;
    if (!stage || !inner || !proj) return;
    const sw = Math.max(60, stage.clientWidth - 26), sh = Math.max(40, stage.clientHeight - 26);
    const ar = proj.width / proj.height;
    let w = sw, h = w / ar;
    if (h > sh) { h = sh; w = h * ar; }
    w = Math.round(w); h = Math.round(h);
    if (H._fw !== w || H._fh !== h) {
      H._fw = w; H._fh = h;
      inner.style.width = w + 'px';
      inner.style.height = h + 'px';
    }
  };
  const E0 = (id) => document.getElementById(id);

  H.setSize = (w, h) => {
    w = U.clamp(Math.round(w / 2) * 2, 64, 7680); h = U.clamp(Math.round(h / 2) * 2, 64, 4320);
    const proj = VX.project.current;
    proj.width = w; proj.height = h;
    VX.project.snapshot('canvas size');
    H.refreshTopbar();
  };

  H.setTab = (t) => {
    H.tab = t;
    for (const k of ['tabProps', 'tabAuto', 'tabFx']) H.els[k].classList.toggle('on', k === 'tab' + t[0].toUpperCase() + t.slice(1));
    H.refreshInspector();
  };

  H.selLayer = () => VX.project.current.layers.find(l => l.id === H.sel) || null;
  H.select = (id) => {
    H.sel = id;
    H.refreshLayers(); H.refreshInspector();
  };

  H.refreshAll = () => { if (!H.ready) return; H.refreshTopbar(); H.refreshLayers(); H.refreshInspector(); H.refreshTimeline(); H.updateTransport(); H.fitStage(); };

  /* ================= TOPBAR ================= */
  H.refreshTopbar = () => {
    const proj = VX.project.current;
    H.els.projName.value = proj.name;
    H.els.fpsSel.value = String(proj.fps);
    const cur = `${proj.width}x${proj.height}`;
    const match = [...H.els.sizeSel.options].find(o => o.value === cur);
    if (match) H.els.sizeSel.value = cur; else H.els.sizeSel.value = 'custom';
  };
  H.updateUndo = () => {
    H.els.undoBtn.disabled = VX.project.undoStack.length < 2;
    H.els.redoBtn.disabled = !VX.project.redoStack.length;
  };
  H.updateSaved = () => {
    H.els.savedDot.classList.add('ok');
    setTimeout(() => H.els.savedDot.classList.remove('ok'), 900);
  };
  H.updateFPS = () => { H.els.fpsMeter.textContent = VX.renderer.fps + ' fps'; };

  /* ================= LAYER LIST ================= */
  H.refreshLayers = () => {
    const list = H.els.layerList;
    list.innerHTML = '';
    const layers = VX.project.current.layers;
    [...layers].reverse().forEach(l => {
      const def = VX.layers.byId[l.type];
      const row = U.el('div', { class: 'layer-row' + (H.sel === l.id ? ' sel' : '') + (l.visible ? '' : ' hidden'), 'data-id': l.id, draggable: 'true' },
        U.el('span', { class: 'l-ic', html: U.icon(def ? def.icon : 'layers') }),
        U.el('span', { class: 'l-name', onclick: () => H.select(l.id), ondblclick: () => H.editLayerName(l, row) }, l.name),
        U.el('button', { class: 'l-btn' + (l.visible ? '' : ' off'), title: 'Show / hide', html: U.icon(l.visible ? 'eye' : 'eyeOff'), onclick: (e) => { e.stopPropagation(); l.visible = !l.visible; VX.project.snapshot('toggle visible'); H.refreshAll(); } }),
        U.el('button', { class: 'l-btn' + (l.locked ? ' on' : ''), title: 'Lock', html: U.icon(l.locked ? 'lock' : 'unlock'), onclick: (e) => { e.stopPropagation(); l.locked = !l.locked; VX.project.snapshot('lock'); H.refreshLayers(); } }),
      );
      row.addEventListener('click', () => H.select(l.id));
      row.addEventListener('contextmenu', e => { e.preventDefault(); H.layerMenu(e, l); });
      row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/lid', l.id); row.classList.add('drag'); });
      row.addEventListener('dragend', () => row.classList.remove('drag'));
      row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('over'); });
      row.addEventListener('dragleave', () => row.classList.remove('over'));
      row.addEventListener('drop', e => {
        e.preventDefault(); row.classList.remove('over');
        const id = e.dataTransfer.getData('text/lid'); if (!id || id === l.id) return;
        const arr = VX.project.current.layers;
        const from = arr.findIndex(x => x.id === id); if (from < 0) return;
        const [item] = arr.splice(from, 1);
        const to = arr.findIndex(x => x.id === l.id);
        const after = e.offsetY > row.offsetHeight / 2;
        arr.splice(to + (after ? 0 : 1), 0, item);
        VX.project.snapshot('reorder layers');
        H.refreshAll();
      });
      list.append(row);
    });
    if (!layers.length) list.append(U.el('div', { class: 'empty-hint' }, 'No layers yet — click “+ Add layer”'));
  };
  H.editLayerName = (l, row) => {
    const nameEl = row.querySelector('.l-name');
    const inp = U.el('input', { class: 'l-name-input', value: l.name });
    nameEl.replaceWith(inp); inp.focus(); inp.select();
    const commit = () => { l.name = inp.value || l.name; VX.project.snapshot('rename layer'); H.refreshLayers(); H.refreshTimeline(); };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') H.refreshLayers(); e.stopPropagation(); });
  };
  H.layerMenu = (e, l) => {
    H.openMenu(e.clientX, e.clientY, [
      { label: 'Rename', ic: 'text', fn: () => { H.select(l.id); const row = H.els.layerList.querySelector(`[data-id="${l.id}"]`); if (row) H.editLayerName(l, row); } },
      { label: 'Duplicate', ic: 'copy', fn: () => H.duplicateLayer(l.id) },
      { label: 'Move up', ic: 'up', fn: () => H.moveLayer(l.id, 1) },
      { label: 'Move down', ic: 'down', fn: () => H.moveLayer(l.id, -1) },
      { label: l.visible ? 'Hide' : 'Show', ic: 'eye', fn: () => { l.visible = !l.visible; VX.project.snapshot('visible'); H.refreshAll(); } },
      { label: 'Delete', ic: 'trash', danger: true, fn: () => H.deleteLayer(l.id) },
    ]);
  };
  H.duplicateLayer = (id) => {
    const arr = VX.project.current.layers;
    const i = arr.findIndex(l => l.id === id); if (i < 0) return;
    const copy = JSON.parse(JSON.stringify(arr[i], (k, v) => (k.startsWith('_') && k !== '_seed') ? undefined : v));
    copy.id = U.uid(); copy.name += ' copy';
    arr.splice(i + 1, 0, copy);
    VX.project.snapshot('duplicate layer');
    H.select(copy.id); H.refreshAll();
  };
  H.moveLayer = (id, dir) => {
    const arr = VX.project.current.layers;
    const i = arr.findIndex(l => l.id === id); if (i < 0) return;
    const j = U.clamp(i + dir, 0, arr.length - 1);
    if (i === j) return;
    const [it] = arr.splice(i, 1); arr.splice(j, 0, it);
    VX.project.snapshot('reorder layer');
    H.refreshAll();
  };
  H.deleteLayer = (id) => {
    const arr = VX.project.current.layers;
    const i = arr.findIndex(l => l.id === id); if (i < 0) return;
    const name = arr[i].name;
    arr.splice(i, 1);
    if (H.sel === id) H.sel = null;
    VX.project.snapshot('delete layer');
    H.refreshAll();
    U.toast(`Deleted “${name}”`);
  };
  H.addLayer = (type) => {
    const l = VX.layers.make(type);
    if (!l) return;
    VX.project.current.layers.push(l);
    VX.project.snapshot('add ' + type);
    H.select(l.id); H.refreshAll();
    U.toast(`Added ${l.name}`);
  };
  H.openLayerMenu = (anchor) => {
    const cats = {};
    for (const def of VX.layers.list) (cats[def.cat] = cats[def.cat] || []).push(def);
    const items = [];
    for (const [cat, defs] of Object.entries(cats)) {
      items.push({ sep: cat });
      for (const d of defs) items.push({ label: d.name, ic: d.icon, hint: d.desc, fn: () => H.addLayer(d.id) });
    }
    const r = anchor.getBoundingClientRect();
    H.openMenu(r.left, r.bottom + 6, items, true);
  };

  /* ================= MENU ================= */
  H.openMenu = (x, y, items, wide) => {
    H.closeMenu();
    const m = U.el('div', { class: 'menu' + (wide ? ' wide' : '') });
    for (const it of items) {
      if (it.sep) { m.append(U.el('div', { class: 'menu-sep' }, it.sep)); continue; }
      m.append(U.el('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), html: `${U.icon(it.ic || 'shape')}<span class="mi-l">${it.label}</span>${it.hint ? `<span class="mi-hint">${it.hint}</span>` : ''}`, onclick: () => { H.closeMenu(); it.fn && it.fn(); } }));
    }
    H.els.menuRoot = m;
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', H._menuCloser = (e) => { if (!m.contains(e.target)) H.closeMenu(); }), 10);
  };
  H.closeMenu = () => {
    if (H.els.menuRoot) { H.els.menuRoot.remove(); H.els.menuRoot = null; }
    if (H._menuCloser) { document.removeEventListener('pointerdown', H._menuCloser); H._menuCloser = null; }
  };

  /* ================= INSPECTOR ================= */
  H.ctrl = (param, get, set) => {
    const wrap = U.el('div', { class: 'ctl ctl-' + param.t });
    const label = U.el('label', { class: 'ctl-l' }, param.label);
    const commit = (v) => set(v, true), live = (v) => set(v, false);
    if (param.t === 'num') {
      const num = U.el('input', { type: 'number', min: param.min, max: param.max, step: param.step, value: get() });
      const rng = U.el('input', { type: 'range', min: param.min, max: param.max, step: param.step, value: get() });
      rng.addEventListener('input', () => { num.value = rng.value; live(+rng.value); });
      rng.addEventListener('change', () => commit(+rng.value));
      num.addEventListener('change', () => { rng.value = num.value; commit(+num.value); });
      wrap.append(label, U.el('div', { class: 'ctl-v' }, rng, num));
    } else if (param.t === 'color') {
      const c = U.el('input', { type: 'color', value: (get() || '#000000').slice(0, 7) });
      const t = U.el('input', { type: 'text', class: 'hexin', value: get() });
      c.addEventListener('input', () => { t.value = c.value; live(c.value); });
      c.addEventListener('change', () => commit(c.value));
      t.addEventListener('change', () => { if (/^#?[0-9a-fA-F]{3,8}$/.test(t.value)) { const v = t.value.startsWith('#') ? t.value : '#' + t.value; c.value = v.slice(0, 7); commit(v); } });
      wrap.append(label, U.el('div', { class: 'ctl-v' }, c, t));
    } else if (param.t === 'sel') {
      const s = U.el('select', {}, ...param.options.map(o => U.el('option', { value: o[0] }, o[1])));
      s.value = get();
      s.addEventListener('change', () => commit(s.value));
      wrap.append(label, U.el('div', { class: 'ctl-v' }, s));
    } else if (param.t === 'bool') {
      const c = U.el('input', { type: 'checkbox' });
      c.checked = !!get();
      c.addEventListener('change', () => commit(c.checked));
      const sw = U.el('label', { class: 'switch' }, c, U.el('span', { class: 'sw' }));
      wrap.append(label, sw);
    } else if (param.t === 'text' || param.t === 'area') {
      const i = U.el(param.t === 'area' ? 'textarea' : 'input', { type: 'text', value: get() });
      if (param.t === 'area') i.rows = 3;
      i.addEventListener('change', () => commit(i.value));
      wrap.append(label, i);
    } else if (param.t === 'file') {
      const cur = VX.assets.get(get());
      const b = U.el('button', { class: 'btn small', html: U.icon('folder') + `<span>${cur ? cur.name.slice(0, 22) : 'Choose file…'}</span>` });
      b.onclick = () => H.pickFile(param.accept || '*/*', async f => {
        const id = await VX.assets.addFile(f);
        commit(id);
        b.querySelector('span').textContent = f.name.slice(0, 22);
      });
      wrap.append(label, b);
    } else if (param.t === 'act') {
      const b = U.el('button', { class: 'btn small act', html: U.icon('settings') + `<span>${param.label}</span>` });
      b.onclick = () => param.fn(H.selLayer());
      wrap.append(b);
    }
    return wrap;
  };

  H.groupEl = (title, open = true) => {
    const g = U.el('div', { class: 'grp' + (open ? '' : ' closed') });
    const head = U.el('div', { class: 'grp-h' }, U.el('span', { class: 'grp-arrow' }, '▸'), title);
    const body = U.el('div', { class: 'grp-b' });
    head.onclick = () => g.classList.toggle('closed');
    g.append(head, body);
    return { g, body };
  };

  H.refreshInspector = () => {
    const root = H.els.inspector;
    root.innerHTML = '';
    const layer = H.selLayer();

    if (!layer) { H.projectInspector(root); return; }
    const def = VX.layers.byId[layer.type];

    /* header */
    const head = U.el('div', { class: 'insp-head' },
      U.el('span', { class: 'insp-ic', html: U.icon(def.icon) }),
      U.el('div', { class: 'insp-title' },
        U.el('input', { class: 'insp-name', value: layer.name, onchange: (e) => { layer.name = e.target.value; VX.project.snapshot('rename'); H.refreshLayers(); H.refreshTimeline(); } }),
        U.el('span', { class: 'insp-type' }, def.name + ' layer')),
      U.el('div', { class: 'insp-actions' },
        U.el('button', { class: 'ib', title: 'Duplicate', html: U.icon('copy'), onclick: () => H.duplicateLayer(layer.id) }),
        U.el('button', { class: 'ib', title: 'Move up', html: U.icon('up'), onclick: () => H.moveLayer(layer.id, 1) }),
        U.el('button', { class: 'ib', title: 'Move down', html: U.icon('down'), onclick: () => H.moveLayer(layer.id, -1) }),
        U.el('button', { class: 'ib danger', title: 'Delete', html: U.icon('trash'), onclick: () => H.deleteLayer(layer.id) })));
    root.append(head);

    if (H.tab === 'props') {
      const tr = H.groupEl('Transform');
      for (const p of TRANSFORM_PARAMS) tr.body.append(H.ctrl(p, () => layer[p.key], (v, c) => { layer[p.key] = v; if (c) VX.project.snapshot(p.label); }));
      const ts = H.groupEl('Time span', false);
      const st = P.num('start', 'Start (s)', 0, 3600, .05, 0);
      ts.body.append(H.ctrl(st, () => layer.start || 0, (v, c) => { layer.start = Math.max(0, v); if (c) { VX.project.snapshot('start'); H.refreshTimeline(); } }));
      const en = P.num('end', 'End (s, empty = till end)', 0, 3600, .05, 0);
      ts.body.append(H.ctrl(en, () => layer.end === null || layer.end === undefined ? '' : layer.end, (v, c) => { layer.end = (v === '' || v === null || +v <= 0) ? null : +v; if (c) { VX.project.snapshot('end'); H.refreshTimeline(); } }));
      root.append(tr.g, ts.g);
      for (const p of def.params) {
        if (p.t === 'group') { const g = H.groupEl(p.label); for (const pp of p.params) g.body.append(H.ctrl(pp, () => layer.props[pp.key], (v, c) => { layer.props[pp.key] = v; if (c) VX.project.snapshot(pp.label); })); root.append(g.g); }
        else root.append(H.ctrl(p, () => layer.props[p.key], (v, c) => { layer.props[p.key] = v; if (c) VX.project.snapshot(p.label); }));
      }
    } else if (H.tab === 'auto') {
      H.autoTab(root, layer, def);
    } else if (H.tab === 'fx') {
      H.fxTab(root, layer);
    }
  };

  /* -------- project inspector (no selection) -------- */
  H.projectInspector = (root) => {
    const proj = VX.project.current;
    root.append(U.el('div', { class: 'insp-head proj' },
      U.el('span', { class: 'insp-ic', html: U.icon('settings') }),
      U.el('div', { class: 'insp-title' }, U.el('span', { class: 'insp-type' }, 'Project settings — click a layer to edit it'))));

    if (H.tab === 'props') {
      const g1 = H.groupEl('Canvas');
      g1.body.append(H.ctrl(P.num('width', 'Width (px)', 64, 7680, 2, 1920), () => proj.width, (v, c) => { proj.width = U.clamp(Math.round(v / 2) * 2, 64, 7680); if (c) VX.project.snapshot('width'); }));
      g1.body.append(H.ctrl(P.num('height', 'Height (px)', 64, 4320, 2, 1080), () => proj.height, (v, c) => { proj.height = U.clamp(Math.round(v / 2) * 2, 64, 4320); if (c) VX.project.snapshot('height'); }));
      g1.body.append(H.ctrl(P.sel('fps', 'Frame rate', [[24, '24'], [25, '25'], [30, '30'], [60, '60']], 60), () => proj.fps, (v, c) => { proj.fps = +v; if (c) { VX.project.snapshot('fps'); H.refreshTopbar(); } }));
      g1.body.append(H.ctrl(P.text('name', 'Project name'), () => proj.name, (v, c) => { proj.name = v || 'Untitled'; if (c) { VX.project.snapshot('name'); H.refreshTopbar(); } }));
      root.append(g1.g);
      const g2 = H.groupEl('Global variables (for expressions)');
      for (const k of ['v1', 'v2', 'v3', 'v4']) g2.body.append(H.ctrl(P.num(k, k, -100, 100, .01, 0), () => proj.vars[k], (v, c) => { proj.vars[k] = v; if (c) VX.project.snapshot(k); }));
      root.append(g2.g);
      const g3 = H.groupEl('Quick actions');
      g3.body.append(U.el('div', { class: 'btn-row' },
        U.el('button', { class: 'btn small', html: U.icon('template') + 'Templates', onclick: () => H.openTemplates() }),
        U.el('button', { class: 'btn small', html: U.icon('export') + 'Export video', onclick: () => H.openExport() }),
        U.el('button', { class: 'btn small', html: U.icon('folder') + 'Projects', onclick: () => H.openProjects() })));
      root.append(g3.g);
    } else if (H.tab === 'fx') {
      const info = U.el('div', { class: 'empty-hint' }, 'Global post effects — applied to the whole frame after all layers');
      root.append(info);
      H.fxTab(root, { id: '__post__', fx: proj.post, name: 'Global FX' });
    } else {
      root.append(U.el('div', { class: 'empty-hint' }, 'Select a layer to add audio reactivity'));
    }
  };

  /* -------- reactivity tab -------- */
  H.autoTab = (root, layer, def) => {
    const proj = VX.project.current;
    const autoKeys = [];
    for (const p of TRANSFORM_PARAMS) if (p.auto) autoKeys.push({ key: p.key, label: p.label, isTransform: true, scale: p.key === 'rotation' ? 360 : p.key === 'scale' ? 1 : .5 });
    const walk = (params) => { for (const p of params) { if (p.t === 'group') walk(p.params); else if (p.auto) autoKeys.push({ key: p.key, label: p.label, isTransform: false, param: p }); } };
    walk(def.params);

    const intro = U.el('div', { class: 'auto-intro' }, 'Bind properties to the music — values are added to the base value.');
    root.append(intro);

    for (const ak of autoKeys) {
      const cur = layer.auto[ak.key] || { src: 'none', amt: 0, expr: '' };
      const row = U.el('div', { class: 'auto-row' });
      row.append(U.el('label', { class: 'ctl-l' }, ak.label));
      const sel = U.el('select', {},
        U.el('option', { value: 'none' }, '— off —'),
        U.el('option', { value: 'bass' }, 'Bass'),
        U.el('option', { value: 'mid' }, 'Mids'),
        U.el('option', { value: 'treble' }, 'Treble'),
        U.el('option', { value: 'level' }, 'Overall level'),
        U.el('option', { value: 'beat' }, 'Beat pulse'),
        U.el('option', { value: 'expr' }, 'ƒ Expression'));
      sel.value = cur.src || 'none';
      const setAuto = (patch) => { layer.auto[ak.key] = { ...(layer.auto[ak.key] || { src: 'none', amt: 0, expr: '' }), ...patch }; VX.project.autosave(); };
      sel.onchange = () => { setAuto({ src: sel.value }); H.refreshInspector(); };
      row.append(sel);
      if (sel.value === 'expr') {
        const inp = U.el('input', { type: 'text', class: 'expr-in', value: cur.expr || '', placeholder: 'e.g. sin(t*2)*40 + bass*90' });
        const err = U.el('div', { class: 'expr-err' });
        const chk = () => { const e = VX.expr.check(inp.value); err.textContent = e ? '⚠ ' + e : ''; };
        chk();
        inp.oninput = () => { setAuto({ expr: inp.value }); chk(); };
        inp.onchange = () => VX.project.snapshot('expression ' + ak.label);
        const help = U.el('div', { class: 'expr-help' }, 'vars: t (sec), dt, bass, mid, treble, level, beat, v1–v4 · fns: sin cos abs min max clamp lerp noise saw tri sq …');
        row.append(U.el('div', { class: 'auto-expr' }, inp, err, help));
      } else if (sel.value !== 'none') {
        const sc = ak.isTransform ? ak.scale : Math.max(.05, (ak.param.max - ak.param.min) / 4);
        const rng = U.el('input', { type: 'range', min: -sc, max: sc, step: sc / 100, value: cur.amt || 0 });
        const num = U.el('input', { type: 'number', min: -sc, max: sc, step: sc / 100, value: cur.amt || 0 });
        rng.oninput = () => { num.value = rng.value; setAuto({ amt: +rng.value }); };
        rng.onchange = () => VX.project.snapshot('reactivity ' + ak.label);
        num.onchange = () => { rng.value = num.value; setAuto({ amt: +num.value }); VX.project.snapshot('reactivity ' + ak.label); };
        row.append(U.el('div', { class: 'ctl-v' }, rng, num));
      }
      root.append(row);
    }
  };

  /* -------- fx tab -------- */
  H.fxTab = (root, layer) => {
    const isPost = layer.id === '__post__';
    const addBtn = U.el('button', { class: 'btn small add-fx', html: U.icon('fx') + '<span>Add effect</span>' });
    addBtn.onclick = (e) => {
      const cats = {};
      for (const d of VX.fx.list) (cats[d.cat] = cats[d.cat] || []).push(d);
      const items = [];
      for (const [cat, defs] of Object.entries(cats)) {
        items.push({ sep: cat });
        for (const d of defs) items.push({ label: d.name, ic: 'fx', fn: () => { layer.fx.push(VX.fx.make(d.id)); VX.project.snapshot('add fx'); H.refreshInspector(); } });
      }
      const r = e.currentTarget.getBoundingClientRect();
      H.openMenu(r.left, r.top - 8, items, true);
    };
    root.append(U.el('div', { class: 'fx-add-row' }, addBtn));
    if (!layer.fx.length) root.append(U.el('div', { class: 'empty-hint' }, isPost ? 'No global effects yet' : 'No effects on this layer yet'));
    layer.fx.forEach((fx, i) => {
      const def = VX.fx.byId[fx.id]; if (!def) return;
      const card = U.el('div', { class: 'fx-card' + (fx.enabled ? '' : ' off') });
      const head = U.el('div', { class: 'fx-head' },
        U.el('span', { class: 'fx-name' }, def.name),
        U.el('div', { class: 'fx-acts' },
          U.el('button', { class: 'ib', title: 'Toggle', html: U.icon(fx.enabled ? 'eye' : 'eyeOff'), onclick: () => { fx.enabled = !fx.enabled; VX.project.snapshot('fx toggle'); H.refreshInspector(); } }),
          U.el('button', { class: 'ib', title: 'Move up', html: U.icon('up'), onclick: () => { if (i > 0) { [layer.fx[i - 1], layer.fx[i]] = [layer.fx[i], layer.fx[i - 1]]; VX.project.snapshot('fx order'); H.refreshInspector(); } } }),
          U.el('button', { class: 'ib', title: 'Remove', html: U.icon('trash'), onclick: () => { layer.fx.splice(i, 1); VX.project.snapshot('remove fx'); H.refreshInspector(); } })));
      card.append(head);
      for (const p of def.params) card.append(H.ctrl(p, () => fx.params[p.key], (v, c) => { fx.params[p.key] = v; if (c) VX.project.snapshot(def.name); }));
      root.append(card);
    });
  };

  /* ================= TIMELINE ================= */
  H.tlDuration = () => VX.app.duration();
  H.refreshTimeline = () => {
    const rows = H.els.tlRows;
    rows.innerHTML = '';
    const proj = VX.project.current;
    const dur = Math.max(1, H.tlDuration());
    H.els.tlContent.style.width = Math.max(H.els.tlScroll.clientWidth, dur * H.tlZoom + 200) + 'px';
    H.drawRuler();

    /* audio row */
    const eng = VX.audio.engine;
    const audioRow = U.el('div', { class: 'tl-row audio' },
      U.el('div', { class: 'tl-label' }, U.el('span', { class: 'tl-lab-ic', html: U.icon('music') }), U.el('span', { class: 'tl-lab-name' }, eng.name || 'No audio')),
      U.el('div', { class: 'tl-lane', onclick: (e) => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); VX.app.seekTo((e.clientX - r.left + H.els.tlScroll.scrollLeft) / H.tlZoom); } } }));
    const lane = audioRow.querySelector('.tl-lane');
    if (eng.peaks) {
      const wc = U.el('canvas', { class: 'tl-wave' });
      lane.append(wc);
      requestAnimationFrame(() => H.drawWave(wc, eng.peaks, dur));
    } else {
      lane.append(U.el('div', { class: 'tl-noaudio' }, 'Load audio to see the waveform'));
    }
    rows.append(audioRow);

    /* layer rows (top layer first) */
    [...proj.layers].reverse().forEach(l => {
      const def = VX.layers.byId[l.type];
      const row = U.el('div', { class: 'tl-row' + (H.sel === l.id ? ' sel' : '') + (l.visible ? '' : ' hidden') });
      const label = U.el('div', { class: 'tl-label', onclick: () => H.select(l.id) },
        U.el('span', { class: 'tl-lab-ic', html: U.icon(def ? def.icon : 'layers') }),
        U.el('span', { class: 'tl-lab-name' }, l.name));
      const laneEl = U.el('div', { class: 'tl-lane' });
      const start = l.start || 0, end = (l.end === null || l.end === undefined) ? dur : Math.min(l.end, Math.max(dur, l.end));
      const span = U.el('div', { class: 'tl-span type-' + l.type, style: { left: start * H.tlZoom + 'px', width: Math.max(14, (end - start) * H.tlZoom) + 'px' } },
        U.el('div', { class: 'tl-span-l' }), U.el('div', { class: 'tl-span-c' }, def ? def.name : l.type), U.el('div', { class: 'tl-span-r' }));
      span.addEventListener('pointerdown', (e) => {
        if (e.target.classList.contains('tl-span-l') || e.target.classList.contains('tl-span-r')) {
          const edge = e.target.classList.contains('tl-span-l') ? 'l' : 'r';
          const x0 = e.clientX, s0 = start, e0 = end;
          const move = (ev) => {
            let d = (ev.clientX - x0) / H.tlZoom;
            if (H.tlSnap) d = Math.round(d * 4) / 4;
            if (edge === 'l') l.start = U.clamp(s0 + d, 0, (l.end ?? dur) - .1);
            else l.end = U.clamp(e0 + d, (l.start || 0) + .1, 9999);
            H.refreshTimeline();
          };
          const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); VX.project.snapshot('trim layer'); };
          document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
        } else {
          H.select(l.id);
          const x0 = e.clientX, s0 = l.start || 0, len = (l.end ?? null) === null ? null : l.end - s0;
          const move = (ev) => {
            let d = (ev.clientX - x0) / H.tlZoom;
            if (H.tlSnap) d = Math.round(d * 4) / 4;
            l.start = Math.max(0, s0 + d);
            if (len !== null) l.end = l.start + len;
            H.refreshTimeline();
          };
          const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); VX.project.snapshot('move layer'); };
          document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
        }
        e.preventDefault();
      });
      laneEl.append(span);
      row.append(label, laneEl);
      rows.append(row);
    });
  };

  H.drawRuler = () => {
    const c = H.els.tlRuler;
    const w = parseFloat(H.els.tlContent.style.width) || H.els.tlScroll.clientWidth;
    const h = 26;
    c.width = w * devicePixelRatio; c.height = h * devicePixelRatio;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const x = c.getContext('2d');
    x.scale(devicePixelRatio, devicePixelRatio);
    x.clearRect(0, 0, w, h);
    const dur = Math.max(1, H.tlDuration());
    const step = H.tlZoom > 200 ? .5 : H.tlZoom > 90 ? 1 : H.tlZoom > 40 ? 2 : H.tlZoom > 18 ? 5 : 10;
    x.font = '10px system-ui'; x.fillStyle = '#8b93a7'; x.strokeStyle = '#2a3040'; x.lineWidth = 1;
    for (let t = 0; t <= dur; t += step) {
      const px = Math.round(t * H.tlZoom) + .5;
      x.beginPath(); x.moveTo(px, h - 8); x.lineTo(px, h); x.stroke();
      x.fillText(step < 1 ? t.toFixed(1) + 's' : Math.round(t) + 's', px + 3, 12);
    }
    for (let t = 0; t <= dur; t += step / 5) {
      const px = Math.round(t * H.tlZoom) + .5;
      x.beginPath(); x.moveTo(px, h - 4); x.lineTo(px, h); x.stroke();
    }
    c.onpointerdown = (e) => {
      const seek = (ev) => { const r = c.getBoundingClientRect(); VX.app.seekTo(U.clamp((ev.clientX - r.left) / H.tlZoom, 0, dur)); };
      seek(e);
      const mv = ev => seek(ev), up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    };
  };
  H.drawWave = (c, peaks, dur) => {
    const lane = c.parentElement;
    if (!lane) return;
    const w = Math.max(10, dur * H.tlZoom), h = 24;
    c.width = w; c.height = h;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const x = c.getContext('2d');
    x.fillStyle = '#22d3ee33';
    for (let i = 0; i < peaks.length; i++) {
      const px = i / peaks.length * w;
      const ph = peaks[i] * h;
      x.fillRect(px, (h - ph) / 2, Math.max(1, w / peaks.length - .5), ph);
    }
  };

  H.drawOverlay = () => {
    const app = VX.app;
    H.fitStage();
    /* playhead */
    const ph = H.els.playhead;
    if (ph) {
      const t = app.time;
      ph.style.left = t * H.tlZoom + 'px';
      ph.style.display = app.exporting ? 'none' : '';
    }
    /* time labels + seek */
    if (!H._scrubbing) {
      H.els.timeCur.textContent = U.fmtTime(app.time);
      H.els.seek.value = U.clamp(app.time / Math.max(.01, app.duration()) * 1000, 0, 1000);
    }
    H.els.timeTotal.textContent = U.fmtTime(app.duration());
    /* beat dot */
    const eng = VX.audio.engine;
    H.els.beatDot.style.opacity = 0.25 + eng.beat * 0.75;
    H.els.beatDot.style.transform = `scale(${1 + eng.beat * .8})`;
    /* selection anchor on canvas */
    const ov = H.els.overlay;
    const l = H.selLayer();
    const mark = ov.querySelector('.anchor');
    if (l && !app.exporting) {
      const stage = H.els.stage;
      const cw = H.els.preview.clientWidth, chh = H.els.preview.clientHeight;
      const px = l.x * cw, py = l.y * chh;
      if (!mark) {
        ov.append(U.el('div', { class: 'anchor' }, U.el('div', { class: 'anchor-dot' }), U.el('div', { class: 'anchor-ring' })));
      } else { mark.style.display = ''; }
      const m = ov.querySelector('.anchor');
      m.style.left = px + 'px'; m.style.top = py + 'px';
    } else if (mark) mark.style.display = 'none';
  };

  H.updateTransport = () => {
    const app = VX.app, eng = VX.audio.engine;
    H.els.playBtn.innerHTML = U.icon(app.playing ? 'pause' : 'play');
    H.els.playBtn.classList.toggle('playing', app.playing);
    H.els.loopBtn.classList.toggle('on', app.loop);
    H.els.micBtn.classList.toggle('on', app.micOn);
    H.els.muteBtn.innerHTML = U.icon(app.muted ? 'volumeOff' : 'volume');
    H.els.audioName.textContent = eng.name ? eng.name : 'No audio loaded';
    H.els.audioName.title = eng.name || '';
  };

  /* ================= CANVAS INTERACTION ================= */
  H.bindCanvasDrag = () => {
    const cv = H.els.preview, ov = H.els.overlay;
    let dragging = false;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: U.clamp((e.clientX - r.left) / r.width, -0.5, 1.5), y: U.clamp((e.clientY - r.top) / r.height, -0.5, 1.5) };
    };
    cv.addEventListener('pointerdown', (e) => {
      const l = H.selLayer();
      if (!l || l.locked || VX.app.exporting) return;
      dragging = true;
      const start = pos(e), x0 = l.x, y0 = l.y;
      const move = (ev) => {
        if (!dragging) return;
        const p = pos(ev);
        l.x = U.clamp(x0 + (p.x - start.x), 0, 1);
        l.y = U.clamp(y0 + (p.y - start.y), 0, 1);
        VX.project.autosave();
        H.inspectorLiveRefresh();
      };
      const up = () => {
        dragging = false;
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
        VX.project.snapshot('move layer');
      };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
  };
  H.inspectorLiveRefresh = U.debounce(() => { if (H.tab === 'props') H.refreshInspector(); }, 150);

  /* ================= FILE PICKING / DND ================= */
  H.pickFile = (accept, cb) => {
    const inp = U.el('input', { type: 'file', accept });
    inp.onchange = () => { if (inp.files[0]) cb(inp.files[0]); };
    inp.click();
  };
  H.loadAudioFile = async (f) => {
    try {
      U.toast('Decoding ' + f.name + '…');
      await VX.audio.engine.loadFile(f);
      VX.app.time = 0;
      VX.project.current.audioName = f.name;
      H.refreshTimeline(); H.updateTransport();
      U.toast(`Audio loaded — ${U.fmtTime(VX.audio.engine.duration)}${VX.audio.engine.duration > 300 ? '' : ''}`);
      VX.app.play();
    } catch (e) { U.toast('Could not decode that audio file', 'err'); }
  };
  H.loadDemo = async () => {
    U.toast('Synthesizing demo beat…');
    await VX.audio.engine.loadDemo();
    VX.app.time = 0;
    H.refreshTimeline(); H.updateTransport();
    U.toast('Demo beat ready — press play');
    VX.app.play();
  };
  H.bindDnD = () => {
    const over = U.el('div', { class: 'dropzone', html: '<div>Drop files to add</div>' });
    let n = 0;
    document.addEventListener('dragenter', (e) => { e.preventDefault(); if (++n === 1) document.body.append(over); });
    document.addEventListener('dragleave', (e) => { e.preventDefault(); if (--n <= 0) { n = 0; over.remove(); } });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', async (e) => {
      e.preventDefault(); n = 0; over.remove();
      for (const f of e.dataTransfer.files) await H.handleDrop(f);
    });
  };
  H.handleDrop = async (f) => {
    if (f.name.endsWith('.vlx')) { await VX.project.importFile(f); return; }
    if (f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(f.name)) { await H.loadAudioFile(f); return; }
    if (f.type.startsWith('image/')) {
      const id = await VX.assets.addFile(f);
      const l = VX.layers.make('image'); l.props.assetId = id; l.name = f.name.slice(0, 24);
      VX.project.current.layers.push(l); VX.project.snapshot('drop image');
      H.select(l.id); H.refreshAll(); U.toast('Image added');
      return;
    }
    if (f.type.startsWith('video/')) {
      const id = await VX.assets.addFile(f);
      const l = VX.layers.make('video'); l.props.assetId = id; l.name = f.name.slice(0, 24);
      VX.project.current.layers.push(l); VX.project.snapshot('drop video');
      H.select(l.id); H.refreshAll(); U.toast('Video added');
      return;
    }
    if (/\.(lrc|ttml|txt)$/i.test(f.name)) {
      const text = await U.readText(f);
      const lines = f.name.endsWith('ttml') ? VX.layers.parseTTML(text) : VX.layers.parseLRC(text);
      let lyr = VX.project.current.layers.find(l => l.type === 'lyrics');
      if (!lyr) { lyr = VX.layers.make('lyrics'); VX.project.current.layers.push(lyr); }
      lyr.props.lines = lines;
      VX.project.snapshot('import lyrics');
      H.select(lyr.id); H.refreshAll();
      U.toast(`Imported ${lines.length} lyric lines`);
      return;
    }
    U.toast('Unsupported file: ' + f.name, 'warn');
  };

  /* ================= SHORTCUTS ================= */
  H.bindShortcuts = () => {
    document.addEventListener('keydown', (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
      if (e.key === 'Escape') { H.closeModal(); H.closeMenu(); if (document.fullscreenElement) document.exitFullscreen(); return; }
      if (typing) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? VX.project.redo() : VX.project.undo(); return; }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); VX.project.redo(); return; }
      if (meta && e.key.toLowerCase() === 'd') { e.preventDefault(); if (H.sel) H.duplicateLayer(H.sel); return; }
      if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); VX.project.saveNow(); U.toast('Project saved'); return; }
      if (VX.app.exporting) return;
      switch (e.key) {
        case ' ': e.preventDefault(); VX.audio.engine.resume().then(() => VX.app.togglePlay()); break;
        case 'Delete': case 'Backspace': if (H.sel) { e.preventDefault(); H.deleteLayer(H.sel); } break;
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
          const l = H.selLayer(); if (!l) break; e.preventDefault();
          const d = e.shiftKey ? .05 : .005;
          if (e.key === 'ArrowUp') l.y -= d; if (e.key === 'ArrowDown') l.y += d;
          if (e.key === 'ArrowLeft') l.x -= d; if (e.key === 'ArrowRight') l.x += d;
          H.inspectorLiveRefresh(); VX.project.autosave();
          break;
        }
        case 'f': case 'F': H.toggleFullscreen(); break;
        case 'p': case 'P': VX.exporter.snapshotPNG(); break;
        case 'e': case 'E': H.openExport(); break;
        case 't': case 'T': H.openTemplates(); break;
        case 'm': case 'M': H.els.micBtn.click(); break;
        case 'l': case 'L': H.els.loopBtn.click(); break;
        case '?': H.openHelp(); break;
      }
    });
  };
  H.toggleFullscreen = () => {
    const stage = document.getElementById('stage');
    if (!document.fullscreenElement) stage.requestFullscreen && stage.requestFullscreen();
    else document.exitFullscreen();
  };

  /* ================= MODALS ================= */
  H.openModal = (title, body, opts) => {
    H.closeModal();
    opts = opts || {};
    const back = U.el('div', { class: 'modal-back' });
    const card = U.el('div', { class: 'modal' + (opts.wide ? ' wide' : '') });
    const head = U.el('div', { class: 'modal-h' }, U.el('h3', {}, title), U.el('button', { class: 'ib', html: U.icon('close'), onclick: () => H.closeModal(true) }));
    card.append(head, U.el('div', { class: 'modal-b' }, body));
    back.append(card);
    back.addEventListener('pointerdown', e => { if (e.target === back && !opts.sticky) H.closeModal(true); });
    document.body.append(back);
    H._modal = { back, onClose: opts.onClose };
    return { close: () => H.closeModal(true), back, card };
  };
  H.closeModal = (fireClose) => {
    if (!H._modal) return;
    H._modal.back.remove();
    if (fireClose && H._modal.onClose) H._modal.onClose();
    H._modal = null;
  };

  /* ================= NATIVE DIALOG REPLACEMENTS ================= */
  H.confirmDlg = (msg, onYes, yesLabel) => {
    const body = U.el('div', {},
      U.el('p', { class: 'modal-note', style: { marginBottom: '4px', fontSize: '13px', color: 'var(--txt)' } }, msg),
      U.el('div', { class: 'btn-row end' },
        U.el('button', { class: 'btn', onclick: () => H.closeModal(true) }, 'Cancel'),
        U.el('button', { class: 'btn primary', onclick: () => { H.closeModal(true); onYes(); } }, yesLabel || 'Confirm')));
    H.openModal('Please confirm', body);
  };
  H.promptDlg = (msg, def, onOk) => {
    const inp = U.el('input', { type: 'text', value: def || '', style: { width: '100%', padding: '8px 10px', background: 'var(--bg2)', border: '1px solid var(--line2)', borderRadius: '8px', color: 'var(--txt)' } });
    const body = U.el('div', {},
      U.el('p', { class: 'modal-note', style: { marginBottom: '8px', fontSize: '13px', color: 'var(--txt)' } }, msg),
      inp,
      U.el('div', { class: 'btn-row end' },
        U.el('button', { class: 'btn', onclick: () => H.closeModal(true) }, 'Cancel'),
        U.el('button', { class: 'btn primary', onclick: () => { const v = inp.value; H.closeModal(true); onOk(v); } }, 'OK')));
    H.openModal('Rename', body);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  };

  H.openCustomSize = () => {
    const proj = VX.project.current;
    const body = U.el('div', { class: 'custom-size' });
    const w = U.el('input', { type: 'number', value: proj.width, min: 64, max: 7680 });
    const h = U.el('input', { type: 'number', value: proj.height, min: 64, max: 4320 });
    body.append(U.el('div', { class: 'btn-row' }, w, U.el('span', { class: 'dim' }, '×'), h));
    const presets = U.el('div', { class: 'btn-row wrap' });
    [['1920×1080', 1920, 1080], ['1080×1920', 1080, 1920], ['1080×1080', 1080, 1080], ['3840×2160', 3840, 2160], ['2560×1440', 2560, 1440], ['854×480', 854, 480]].forEach(([lab, pw, ph]) => {
      presets.append(U.el('button', { class: 'btn small', onclick: () => { w.value = pw; h.value = ph; } }, lab));
    });
    body.append(presets, U.el('div', { class: 'btn-row end' }, U.el('button', { class: 'btn primary', onclick: () => { H.setSize(+w.value, +h.value); H.closeModal(true); } }, 'Apply')));
    H.openModal('Custom canvas size', body);
  };

  H.openTemplates = () => {
    const grid = U.el('div', { class: 'tpl-grid' });
    for (const t of VX.templates.list) {
      const card = U.el('div', { class: 'tpl-card' });
      const thumb = U.el('div', { class: 'tpl-thumb', style: { background: `linear-gradient(135deg, ${t.grad[0]}, ${t.grad[1]})` } },
        U.el('span', { class: 'tpl-glyph', html: U.icon('spark', 22) }));
      card.append(thumb, U.el('div', { class: 'tpl-name' }, t.name), U.el('div', { class: 'tpl-desc' }, t.desc));
      card.onclick = () => { VX.templates.apply(t); H.closeModal(true); };
      grid.append(card);
    }
    const m = H.openModal('Templates', U.el('div', {}, U.el('p', { class: 'modal-note' }, 'Templates replace your layers (audio and canvas size stay). Everything remains fully editable.'), grid), { wide: true });
  };

  H.openProjects = () => {
    const body = U.el('div', { class: 'proj-list' });
    const list = VX.project.list();
    if (!list.length) body.append(U.el('div', { class: 'empty-hint' }, 'No saved projects yet — they save automatically to this browser'));
    for (const rec of list) {
      const row = U.el('div', { class: 'proj-row' + (rec.id === VX.project.current.id ? ' cur' : '') },
        U.el('div', { class: 'proj-info' },
          U.el('strong', {}, rec.name || 'Untitled'),
          U.el('span', { class: 'proj-meta' }, `${rec.layers} layers · ${new Date(rec.updated).toLocaleString()}`)),
        U.el('div', { class: 'btn-row' },
          U.el('button', { class: 'btn small primary', html: U.icon('check') + 'Open', onclick: () => { if (VX.project.open(rec.id)) { H.closeModal(true); H.refreshAll(); U.toast('Opened ' + (rec.name || 'project')); } } }),
          U.el('button', { class: 'btn small', title: 'Rename', html: U.icon('text'), onclick: () => {
            H.promptDlg('Rename project', rec.name, (nn) => {
              if (!nn) return;
              const all = JSON.parse(localStorage.getItem('vlexyna_projects_v1') || '{}');
              if (all[rec.id]) { all[rec.id].name = nn; localStorage.setItem('vlexyna_projects_v1', JSON.stringify(all)); }
              H.openProjects();
            });
          } }),
          U.el('button', { class: 'btn small danger', title: 'Delete', html: U.icon('trash'), onclick: () => {
            H.confirmDlg(`Delete “${rec.name}”? This cannot be undone.`, () => {
              VX.project.remove(rec.id);
              H.openProjects();
            }, 'Delete');
          } })));
      body.append(row);
    }
    const foot = U.el('div', { class: 'btn-row end' },
      U.el('button', { class: 'btn', html: U.icon('plus') + 'New project', onclick: () => {
        H.confirmDlg('Start a new empty project? Your current project stays saved in the list.', () => { VX.project.newProject('Untitled'); H.closeModal(true); H.refreshAll(); }, 'New project');
      } }),
      U.el('button', { class: 'btn', html: U.icon('export') + 'Import .vlx', onclick: () => H.pickFile('.vlx,application/json', async f => { await VX.project.importFile(f); H.closeModal(true); H.refreshAll(); }) }),
      U.el('button', { class: 'btn primary', html: U.icon('export') + 'Export .vlx', onclick: () => { VX.project.exportFile(); } }));
    body.append(foot);
    H.openModal('Projects', body, { wide: true });
  };

  H.openExport = () => {
    const proj = VX.project.current;
    const eng = VX.audio.engine;
    const mime = VX.exporter.bestMime();
    const ext = VX.exporter.extFor(mime);
    const body = U.el('div', { class: 'export-body' });
    const info = U.el('div', { class: 'exp-info' },
      U.el('div', {}, U.el('strong', {}, `${proj.width} × ${proj.height}`), ` · ${eng.duration ? U.fmtTime(eng.duration) : 'no audio (30s)'}`),
      U.el('div', { class: 'muted' }, `Format: ${ext.toUpperCase()} ${mime ? '· ' + mime.split(';')[0].replace('video/', '') : '— recording happens in real time'}`));
    body.append(info);

    const mkSel = (label, opts, val) => {
      const s = U.el('select', {}, ...opts.map(o => U.el('option', { value: o[0] }, o[1])));
      s.value = String(val);
      const row = U.el('div', { class: 'ctl' }, U.el('label', { class: 'ctl-l' }, label), U.el('div', { class: 'ctl-v' }, s));
      return { row, s };
    };
    const fps = mkSel('Frame rate', [[30, '30 fps'], [60, '60 fps']], proj.fps >= 50 ? 60 : 30);
    const br = mkSel('Quality', [[8e6, 'Standard (8 Mbps)'], [16e6, 'High (16 Mbps)'], [28e6, 'Very high (28 Mbps)'], [45e6, 'Insane (45 Mbps)']], 16e6);
    body.append(fps.row, br.row);

    const audioCk = U.el('input', { type: 'checkbox' }); audioCk.checked = !!eng.buffer;
    const monCk = U.el('input', { type: 'checkbox' }); monCk.checked = true;
    const ck = (label, c, dis) => U.el('div', { class: 'ctl' }, U.el('label', { class: 'ctl-l' }, label), U.el('label', { class: 'switch' + (dis ? ' dis' : '') }, c, U.el('span', { class: 'sw' })));
    if (!eng.buffer) audioCk.disabled = true;
    body.append(ck('Include audio', audioCk), ck('Listen while exporting', monCk));

    const progWrap = U.el('div', { class: 'exp-prog', style: { display: 'none' } });
    const bar = U.el('div', { class: 'exp-bar' }, U.el('div', { class: 'exp-bar-fill' }));
    const lab = U.el('div', { class: 'exp-lab' }, '');
    progWrap.append(bar, lab);
    body.append(progWrap);

    const btnRow = U.el('div', { class: 'btn-row end' });
    const go = U.el('button', { class: 'btn primary big', html: U.icon('export') + '<span>Start export</span>' });
    const frames = U.el('button', { class: 'btn', html: U.icon('camera') + '<span>PNG sequence (.zip)</span>' });
    const snap = U.el('button', { class: 'btn', html: U.icon('camera') + '<span>Current frame (PNG)</span>' });
    btnRow.append(snap, frames, go);
    body.append(btnRow);

    snap.onclick = () => VX.exporter.snapshotPNG();
    frames.onclick = async () => {
      if (VX.exporter.active) return;
      H.closeModal(true);
      H.openProgress('Exporting PNG sequence…');
      await VX.exporter.exportFrames({ fps: 12 });
      H.closeModal(true);
    };
    go.onclick = async () => {
      if (VX.exporter.active) return;
      H.closeModal(true);
      H.openProgress('Recording video…');
      await VX.exporter.exportVideo({
        fps: +fps.s.value, bitrate: +br.s.value,
        includeAudio: audioCk.checked, monitor: monCk.checked
      });
      H.closeModal(true);
    };
    H.openModal('Export video', body);
  };
  H.openProgress = (title) => {
    const bar = U.el('div', { class: 'exp-bar' }, U.el('div', { class: 'exp-bar-fill' }));
    const lab = U.el('div', { class: 'exp-lab' }, 'Starting…');
    const cancel = U.el('button', { class: 'btn', html: U.icon('close') + '<span>Cancel</span>', onclick: () => VX.exporter.cancel && VX.exporter.cancel() });
    const m = H.openModal(title, U.el('div', { class: 'exp-prog on' }, bar, lab, U.el('div', { class: 'btn-row end' }, cancel)), { sticky: true });
    VX.app.onExportProgress = (p, t, dur) => {
      bar.firstChild.style.width = Math.round(p * 100) + '%';
      lab.textContent = `${Math.round(p * 100)}% — ${U.fmtTime(t)} / ${U.fmtTime(dur)}`;
    };
    H._progressModal = m;
  };

  H.openHelp = () => {
    const body = U.el('div', { class: 'help-body' });
    const sc = [['Space', 'Play / pause'], ['Ctrl/⌘ + Z', 'Undo'], ['Ctrl/⌘ + Shift + Z', 'Redo'], ['Ctrl/⌘ + D', 'Duplicate layer'], ['Ctrl/⌘ + S', 'Save project'], ['Delete', 'Delete layer'], ['Arrows', 'Nudge layer (Shift = bigger)'], ['F', 'Fullscreen preview'], ['P', 'Save PNG frame'], ['E', 'Export video'], ['T', 'Templates'], ['M', 'Microphone live mode'], ['L', 'Loop toggle'], ['Esc', 'Close / exit fullscreen']];
    const tab = U.el('table', { class: 'sc-table' });
    for (const [k, v] of sc) tab.append(U.el('tr', {}, U.el('td', {}, U.el('kbd', {}, k)), U.el('td', {}, v)));
    body.append(
      U.el('h4', {}, 'Quick start'),
      U.el('ol', { class: 'qs' },
        U.el('li', {}, 'Load audio (or click ', U.el('b', {}, 'Demo beat'), ' to synthesize one in your browser).'),
        U.el('li', {}, 'Apply a ', U.el('b', {}, 'template'), ' or add layers with ', U.el('b', {}, '+ Add layer'), '.'),
        U.el('li', {}, 'Make layers react to the music in the ', U.el('b', {}, 'Reactivity'), ' tab.'),
        U.el('li', {}, 'Stack per-layer effects in the ', U.el('b', {}, 'FX'), ' tab; global effects live there when nothing is selected.'),
        U.el('li', {}, 'Export up to 8K video — rendered locally, no watermark, no upload.')),
      U.el('h4', {}, 'Keyboard shortcuts'), tab,
      U.el('h4', {}, 'Tips'),
      U.el('ul', { class: 'tips' },
        U.el('li', {}, 'Drag images / videos / audio / .lrc lyric files anywhere onto the window.'),
        U.el('li', {}, 'Click the canvas and drag to move the selected layer.'),
        U.el('li', {}, 'Deselect everything to edit project settings & global FX.'),
        U.el('li', {}, 'Everything is stored locally in your browser — export a .vlx file to back it up.')));
    H.openModal('Help & shortcuts', body, { wide: true });
  };

  H.openWelcome = () => {
    const body = U.el('div', { class: 'welcome' });
    body.append(U.el('div', { class: 'w-logo', html: U.icon('logo', 40) + '<span>VLEXYNA</span>' }));
    body.append(U.el('p', { class: 'w-tag' }, 'Visualize your sound. A free, unlimited music-video studio in your browser — no account, no watermark, no uploads.'));
    const feats = U.el('div', { class: 'w-feats' });
    [['Up to 8K 60fps', ' Renders locally on your machine'], ['18 layer types', ' spectrum, particles, lyrics, video, shader-ish FX…'], ['Audio reactivity', ' bind any property to bass / mids / treble / beats'], ['14 stackable effects', ' glow, blurs, RGB split, edge detect, grain…'], ['Math automations', ' drive properties with expressions'], ['Templates & projects', ' everything saved locally, export & share .vlx files']].forEach(([b, s]) => feats.append(U.el('div', { class: 'w-feat' }, U.el('b', {}, b), U.el('span', {}, s))));
    body.append(feats);
    const btns = U.el('div', { class: 'btn-row center' },
      U.el('button', { class: 'btn primary big', html: U.icon('play') + '<span>Try the demo project</span>', onclick: async () => {
        H.closeModal(true);
        const t = VX.templates.list.find(x => x.name === 'Trap Nation');
        if (t) VX.templates.apply(t);
        await H.loadDemo();
      } }),
      U.el('button', { class: 'btn big', html: U.icon('template') + '<span>Browse templates</span>', onclick: () => { H.closeModal(true); H.openTemplates(); } }),
      U.el('button', { class: 'btn big', html: U.icon('plus') + '<span>Start blank</span>', onclick: () => { H.closeModal(true); } }));
    body.append(btns);
    H.openModal('', body, { wide: true, sticky: true });
    H._modal.back.querySelector('.modal-h').style.display = 'none';
  };

  /* ================= LYRICS EDITOR ================= */
  H.openLyricsEditor = (layer) => {
    const body = U.el('div', { class: 'lyr-editor' });
    const list = U.el('div', { class: 'lyr-list' });
    const ta = U.el('textarea', { class: 'lyr-ta', rows: 8, placeholder: 'Paste lyrics here — one line per row.\nThen use Tap-sync to time each line while the music plays.\n\nOr drop an .lrc file: [01:23.45] line text' });
    let lines = (layer.props.lines || []).map(l => ({ ...l }));
    const renderList = () => {
      list.innerHTML = '';
      if (!lines.length) list.append(U.el('div', { class: 'empty-hint' }, 'No lines yet — paste or import lyrics'));
      lines.forEach((ln, i) => {
        const row = U.el('div', { class: 'lyr-row' + (ln.t === null || ln.t === undefined ? ' untimed' : '') });
        const time = U.el('button', { class: 'lyr-time', title: 'Seek here / set from playhead' }, ln.t === null || ln.t === undefined ? '--:--.-' : U.fmtTime(ln.t));
        time.onclick = () => { VX.app.seekTo(ln.t || 0); };
        const txt = U.el('input', { type: 'text', value: ln.text });
        txt.onchange = () => { ln.text = txt.value; };
        const set = U.el('button', { class: 'ib', title: 'Set time from playhead', html: U.icon('clockIcon'), onclick: () => { ln.t = VX.app.time; renderList(); } });
        const del = U.el('button', { class: 'ib danger', title: 'Remove line', html: U.icon('trash'), onclick: () => { lines.splice(i, 1); renderList(); } });
        row.append(time, txt, set, del);
        list.append(row);
      });
    };
    renderList();
    ta.value = lines.map(l => l.t !== null && l.t !== undefined ? `[${U.fmtTime(l.t)}] ${l.text}` : l.text).join('\n');

    const toolbar = U.el('div', { class: 'btn-row wrap' });
    const parseTA = () => {
      lines = VX.layers.parseLRC(ta.value);
      renderList();
    };
    ta.addEventListener('change', parseTA);
    toolbar.append(
      U.el('button', { class: 'btn small', html: U.icon('plus') + 'Add line', onclick: () => { lines.push({ t: null, text: 'new line' }); renderList(); } }),
      U.el('button', { class: 'btn small', html: U.icon('lyrics') + 'Import LRC / TTML', onclick: () => H.pickFile('.lrc,.ttml,.txt,text/plain', async f => { const t2 = await U.readText(f); lines = f.name.endsWith('ttml') ? VX.layers.parseTTML(t2) : VX.layers.parseLRC(t2); ta.value = lines.map(l => `[${U.fmtTime(l.t)}] ${l.text}`).join('\n'); renderList(); }) }),
      U.el('button', { class: 'btn small', html: U.icon('clock') + 'Clear times', onclick: () => { lines.forEach(l => l.t = null); renderList(); } }),
      U.el('button', { class: 'btn small', html: U.icon('play') + 'Tap-sync mode', onclick: () => tapMode() }));

    let tapOn = false, tapIdx = 0;
    const tapMode = () => {
      tapOn = true; tapIdx = 0;
      U.toast('Tap-sync: press SPACE to stamp the current time on the highlighted line');
      VX.audio.engine.resume().then(() => VX.app.play());
      highlight();
    };
    const highlight = () => { [...list.children].forEach((r, i) => r.classList.toggle('tap', i === tapIdx)); if (list.children[tapIdx]) list.children[tapIdx].scrollIntoView({ block: 'nearest' }); };
    const keyH = (e) => {
      if (!tapOn || !H._modal) return;
      if (e.key === ' ') {
        e.preventDefault(); e.stopPropagation();
        if (lines[tapIdx]) { lines[tapIdx].t = VX.app.time; renderList(); highlight(); }
        tapIdx++;
        if (tapIdx >= lines.length) { tapOn = false; U.toast('Tap-sync complete!'); }
      }
    };
    document.addEventListener('keydown', keyH, true);

    body.append(toolbar, U.el('div', { class: 'lyr-cols' }, U.el('div', {}, U.el('label', { class: 'ctl-l' }, 'Raw text (LRC format)'), ta, list)));
    const save = () => {
      layer.props.lines = lines.filter(l => (l.text || '').trim());
      VX.project.snapshot('edit lyrics');
      H.refreshTimeline();
    };
    const m = H.openModal('Lyrics — ' + layer.name, body, { wide: true, onClose: () => { document.removeEventListener('keydown', keyH, true); save(); } });
    body.append(U.el('div', { class: 'btn-row end' }, U.el('button', { class: 'btn primary', html: U.icon('check') + 'Save lyrics', onclick: () => { save(); H.closeModal(true); } })));
  };
})();
