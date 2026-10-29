/* Vlexyna — media.js — assets + image/video/text/lyrics/progress layers */
'use strict';
import { VX, U } from './util.js';
(() => {
  const P = VX.P, L = VX.layers;

  /* ============ ASSETS ============ */
  const A = VX.assets = {
    map: new Map(),
    async addFile(file) {
      const id = U.uid();
      /* Lottie / JSON assets are stored as parsed text, not as an element */
      const isJson = (file.type && file.type.includes('json')) || /\.json$/i.test(file.name);
      if (isJson) {
        const text = await U.readText(file);
        let data = null;
        try { data = JSON.parse(text); } catch (e) { }
        A.map.set(id, { id, kind: 'json', name: file.name, data, text });
        return id;
      }
      const dataUrl = await U.readDataURL(file);
      const kind = file.type.startsWith('video') ? 'video' : 'image';
      let el;
      if (kind === 'image') {
        el = new Image(); el.src = dataUrl;
        await new Promise((r, j) => { el.onload = r; el.onerror = j; });
      } else {
        el = document.createElement('video');
        el.src = dataUrl; el.muted = true; el.playsInline = true; el.loop = true; el.preload = 'auto';
        await new Promise((r) => { el.onloadeddata = r; setTimeout(r, 3000); });
      }
      A.map.set(id, { id, kind, name: file.name, dataUrl, el });
      return id;
    },
    addData(kind, name, dataUrl, text) {
      const id = U.uid();
      if (kind === 'font') {
        A.map.set(id, { id, kind: 'font', name, dataUrl });
        A._loadFontFace(name, dataUrl);
        return id;
      }
      if (kind === 'json') {
        let data = null;
        try { data = JSON.parse(text || dataUrl || 'null'); } catch (e) { }
        A.map.set(id, { id, kind: 'json', name, data, text: text || dataUrl });
        return id;
      }
      let el;
      if (kind === 'image') { el = new Image(); el.src = dataUrl; }
      else { el = document.createElement('video'); el.src = dataUrl; el.muted = true; el.playsInline = true; el.loop = true; el.preload = 'auto'; }
      A.map.set(id, { id, kind, name, dataUrl, el });
      return id;
    },
    get: (id) => A.map.get(id),
    /* register an uploaded font with the document and every font picker */
    async _loadFontFace(name, dataUrl) {
      const family = (name || 'Custom font').replace(/\.[^.]+$/, '').replace(/["']/g, '');
      try {
        if (typeof FontFace !== 'undefined' && document && document.fonts) {
          const ff = new FontFace(family, `url(${dataUrl})`);
          await ff.load();
          document.fonts.add(ff);
        }
      } catch (e) { /* headless / unsupported — the asset still round-trips */ }
      const L2 = VX.layers;
      if (L2) L2.registerFontCss(family, `'${family}', sans-serif`);
    },
    drawCover(x, el, cx, cy, w, h) {
      const iw = el.videoWidth || el.naturalWidth, ih = el.videoHeight || el.naturalHeight;
      if (!iw || !ih) return;
      const s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
      x.drawImage(el, cx - dw / 2, cy - dh / 2, dw, dh);
    },
    drawContain(x, el, cx, cy, w, h) {
      const iw = el.videoWidth || el.naturalWidth, ih = el.videoHeight || el.naturalHeight;
      if (!iw || !ih) return;
      const s = Math.min(w / iw, h / ih), dw = iw * s, dh = ih * s;
      x.drawImage(el, cx - dw / 2, cy - dh / 2, dw, dh);
    },
    serialize() {
      const o = [];
      for (const a of A.map.values()) o.push({ id: a.id, kind: a.kind, name: a.name, dataUrl: a.dataUrl, text: a.text });
      return o;
    },
    /* ---------- media library — reuse assets across projects (this browser) ----------
       Small assets (< 1.5 MB as data URL) persist to localStorage; the rest live
       for the session only. Stock assets are generated procedurally on demand. */
    LIB_KEY: 'vlexyna_library_v1',
    _lib: null,
    library() {
      if (A._lib) return A._lib;
      try { A._lib = JSON.parse(localStorage.getItem(A.LIB_KEY) || '[]'); } catch (e) { A._lib = []; }
      return A._lib;
    },
    librarySave() {
      try { localStorage.setItem(A.LIB_KEY, JSON.stringify(A._lib || [])); }
      catch (e) { U.toast('Library full — remove some items (browser storage cap)', 'warn'); }
    },
    libraryAdd(kind, name, dataUrl) {
      const lib = A.library();
      if (lib.some(x => x.kind === kind && x.name === name && x.dataUrl === dataUrl)) return false;
      lib.push({ kind, name, dataUrl, added: Date.now() });
      A.librarySave();
      return true;
    },
    libraryRemove(i) { A.library().splice(i, 1); A.librarySave(); },
    /* import a library entry (or stock item) into the current project assets */
    libraryUse(entry) {
      if (entry.kind === 'audio') return entry;   /* audio flows through the audio engine, not assets */
      return A.addData(entry.kind, entry.name, entry.dataUrl);
    },
    /* ---------- stock assets — generated in-browser, zero downloads ---------- */
    _stock: null,
    stock() {
      if (A._stock) return A._stock;
      const mk = (name, w, h, fn) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); fn(x, w, h);
        let dataUrl = '';
        try { dataUrl = c.toDataURL('image/jpeg', .88); } catch (e) { /* embedder without canvas serialization */ }
        if (!dataUrl) return null;
        return { kind: 'image', name, dataUrl, stock: true };
      };
      const S = [];
      S.push(mk('Stock · Aurora', 640, 360, (x, w, h) => {
        const g = x.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#0b1026'); g.addColorStop(.45, '#123a5f'); g.addColorStop(.75, '#1b7c6e'); g.addColorStop(1, '#0e1420');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 5; i++) {
          const gg = x.createLinearGradient(0, h * (.2 + i * .12), w, h * (.5 + i * .1));
          gg.addColorStop(0, 'rgba(34,211,238,0)'); gg.addColorStop(.5, 'rgba(34,211,238,.28)'); gg.addColorStop(1, 'rgba(124,92,255,0)');
          x.fillStyle = gg; x.fillRect(0, h * (.15 + i * .13), w, h * .1);
        }
      }));
      S.push(mk('Stock · Sunset grid', 640, 360, (x, w, h) => {
        const g = x.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#2b1055'); g.addColorStop(.55, '#7b2d8b'); g.addColorStop(.72, '#ff6b6b'); g.addColorStop(1, '#14101e');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.strokeStyle = 'rgba(34,211,238,.5)'; x.lineWidth = 1.2;
        const hz = h * .72;
        for (let i = 0; i <= 16; i++) { const px = (i / 16) * w; x.beginPath(); x.moveTo(w / 2 + (px - w / 2) * .18, hz); x.lineTo(px * 1.6 - w * .3, h); x.stroke(); }
        for (let i = 0; i < 9; i++) { const py = hz + Math.pow(i / 9, 1.7) * (h - hz); x.beginPath(); x.moveTo(0, py); x.lineTo(w, py); x.stroke(); }
        x.fillStyle = '#ffd9a0'; x.beginPath(); x.arc(w / 2, hz - 8, 46, Math.PI, 0); x.fill();
        x.fillStyle = '#14101e'; for (let i = 0; i < 4; i++) x.fillRect(w / 2 - 46, hz - 20 + i * 10, 92, 4);
      }));
      S.push(mk('Stock · Bokeh', 640, 360, (x, w, h) => {
        x.fillStyle = '#0a0d18'; x.fillRect(0, 0, w, h);
        const cols = ['#22d3ee', '#7c5cff', '#f472b6', '#fbbf24'];
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 26; i++) {
          const r = 12 + rnd() * 60, cx = rnd() * w, cy = rnd() * h;
          const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
          const c = cols[i % cols.length];
          g.addColorStop(0, c + '55'); g.addColorStop(.8, c + '22'); g.addColorStop(1, c + '00');
          x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
        }
      }));
      S.push(mk('Stock · Rays', 640, 360, (x, w, h) => {
        x.fillStyle = '#07070f'; x.fillRect(0, 0, w, h);
        x.save(); x.translate(w / 2, h / 2);
        for (let i = 0; i < 24; i++) {
          x.rotate(Math.PI * 2 / 24);
          const g = x.createLinearGradient(0, 0, w, 0);
          g.addColorStop(0, 'rgba(124,92,255,.5)'); g.addColorStop(1, 'rgba(124,92,255,0)');
          x.fillStyle = g;
          x.beginPath(); x.moveTo(0, 0); x.lineTo(w, -14); x.lineTo(w, 14); x.closePath(); x.fill();
        }
        x.restore();
      }));
      S.push(mk('Stock · Noise', 512, 288, (x, w, h) => {
        const d = x.createImageData(w, h);
        let seed = 3; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
        for (let i = 0; i < d.data.length; i += 4) { const v = 24 + rnd() * 90; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
        x.putImageData(d, 0, 0);
      }));
      S.push(mk('Stock · Checker glow', 640, 360, (x, w, h) => {
        x.fillStyle = '#0b0d16'; x.fillRect(0, 0, w, h);
        const s = 40;
        for (let gy = 0; gy < h / s; gy++) for (let gx = 0; gx < w / s; gx++) {
          if ((gx + gy) % 2) continue;
          const px = gx * s, py = gy * s, d = Math.hypot(px - w / 2, py - h / 2) / Math.hypot(w / 2, h / 2);
          x.fillStyle = 'rgba(34,211,238,' + (0.05 + .3 * (1 - d)) + ')';
          x.fillRect(px, py, s - 2, s - 2);
        }
      }));
      A._stock = S.filter(Boolean);
      return A._stock;
    },
    load(list) {
      if (!list) return;
      for (const a of list) if (!A.map.has(a.id)) A.addData(a.kind, a.name, a.dataUrl, a.text);
    }
  };

  /* ============ IMAGE ============ */
  L.register({
    id: 'image', name: 'Image', cat: 'Media', icon: 'image',
    desc: 'Picture / logo with audio-reactive motion',
    defaults: () => ({ assetId: '', fit: 'contain', size: .5, pulse: .12, spin: 0, bob: 0, bobSpeed: 1, circle: false, fade: 0, shadow: 0, cropX: 0, cropY: 0, cropW: 1, cropH: 1 }),
    params: [
      P.file('assetId', 'Image file', 'image/*'),
      P.sel('fit', 'Fit', [['contain', 'Contain'], ['cover', 'Cover']], 'contain'),
      P.num('size', 'Size', .05, 3, .01, .5, { auto: true }),
      P.num('pulse', 'Bass pulse', 0, 1, .01, .12),
      P.num('spin', 'Spin (°/s)', -360, 360, 1, 0, { auto: true }),
      P.num('bob', 'Bob (float)', 0, 1, .01, 0), P.num('bobSpeed', 'Bob speed', .1, 6, .1, 1),
      P.bool('circle', 'Circle mask'),
      P.num('shadow', 'Shadow', 0, 100, 1, 0),
      P.group('Crop', [
        P.num('cropX', 'Crop X', 0, 1, .001, 0),
        P.num('cropY', 'Crop Y', 0, 1, .001, 0),
        P.num('cropW', 'Crop width', .01, 1, .001, 1),
        P.num('cropH', 'Crop height', .01, 1, .001, 1),
        P.act('crop', '✂ Crop editor…', (l) => (VX.ui && VX.ui.openCropper) ? VX.ui.openCropper(l) : U.toast('Crop editor is available in the studio app')),
      ]),
    ],
    draw(x, st) {
      const { H, p, a, t, layer } = st;
      const asset = A.get(p.assetId);
      if (!asset) {
        x.strokeStyle = '#3a4258'; x.setLineDash([10, 8]); x.lineWidth = 3;
        x.strokeRect(-p.size * H / 2, -p.size * H / 2, p.size * H, p.size * H); x.setLineDash([]);
        x.fillStyle = '#5b6478'; x.font = `${28 * H / 1080}px sans-serif`; x.textAlign = 'center'; x.fillText('Drop an image / pick a file →', 0, 8);
        return;
      }
      const k = 1 + a.bass * p.pulse * .5;
      const w = p.size * H * k, h = p.size * H * k;
      x.save();
      x.translate(0, Math.sin(t * p.bobSpeed * 2) * p.bob * H * .1);
      if (p.shadow) { x.shadowBlur = p.shadow * (H / 1080); x.shadowColor = 'rgba(0,0,0,.55)'; }
      if (p.circle) { x.beginPath(); x.arc(0, 0, w / 2, 0, 7); x.clip(); }
      const iw = asset.el.naturalWidth || asset.el.videoWidth || 0, ih = asset.el.naturalHeight || asset.el.videoHeight || 0;
      if (iw && ih && (p.cropW < 1 || p.cropH < 1)) {
        /* cropped draw: source rect is the normalized crop window */
        const sx = p.cropX * iw, sy = p.cropY * ih;
        const sw = Math.max(1, p.cropW * iw), sh = Math.max(1, p.cropH * ih);
        const s = p.fit === 'cover' ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
        const dw = sw * s, dh = sh * s;
        x.drawImage(asset.el, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
      } else {
        (p.fit === 'cover' ? A.drawCover : A.drawContain)(x, asset.el, 0, 0, w, h);
      }
      x.restore();
    }
  });

  /* ============ VIDEO ============ */
  L.register({
    id: 'video', name: 'Video', cat: 'Media', icon: 'video',
    desc: 'Video clip synced to the music',
    defaults: () => ({ assetId: '', fit: 'cover', size: 1, rate: 1, pulse: 0, spin: 0, circle: false, offset: 0, startAt: 0 }),
    params: [
      P.file('assetId', 'Video file', 'video/*'),
      P.sel('fit', 'Fit', [['cover', 'Cover'], ['contain', 'Contain']], 'cover'),
      P.num('size', 'Size', .05, 3, .01, 1, { auto: true }),
      P.num('rate', 'Playback rate', .1, 3, .05, 1),
      P.bool('loop', 'Loop video', true),
      P.num('pulse', 'Bass pulse', 0, 1, .01, 0),
      P.num('spin', 'Spin (°/s)', -360, 360, 1, 0),
      P.num('offset', 'Clip start offset (s)', 0, 300, .1, 0),
      P.bool('circle', 'Circle mask'),
    ],
    draw(x, st) {
      const { H, p, a, playing, t, layer } = st;
      const asset = A.get(p.assetId);
      if (!asset) {
        x.strokeStyle = '#3a4258'; x.setLineDash([10, 8]); x.lineWidth = 3;
        x.strokeRect(-p.size * H / 4, -p.size * H * .28, p.size * H / 2, p.size * H * .56); x.setLineDash([]);
        x.fillStyle = '#5b6478'; x.font = `${26 * H / 1080}px sans-serif`; x.textAlign = 'center'; x.fillText('Pick a video file →', 0, 8);
        return;
      }
      const v = asset.el;
      v.loop = p.loop !== false;
      const local = Math.max(0, (t - (layer.start || 0) - p.startAt)) * p.rate + p.offset;
      const dur = v.duration || 1;
      const want = v.loop ? local % dur : Math.min(local, dur - .05);
      if (playing && v.paused) { v.playbackRate = p.rate; v.play().catch(() => { }); }
      if (!playing && !v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > .35 || (!playing && Math.abs(v.currentTime - want) > .05)) { try { v.currentTime = want; } catch (e) { } }
      const k = 1 + a.bass * p.pulse * .5;
      const w = p.size * H * k, h = p.size * H * k;
      x.save();
      if (p.circle) { x.beginPath(); x.arc(0, 0, w / 2, 0, 7); x.clip(); }
      (p.fit === 'cover' ? A.drawCover : A.drawContain)(x, v, 0, 0, w, h);
      x.restore();
    }
  });

  /* ============ TEXT ============ */
  const textAnim = (x, st, p, box) => {
    const { a, t, layer } = st;
    let reveal = 1, dy = 0, alpha = 1, scale = 1;
    switch (p.anim) {
      case 'pulse': scale = 1 + a.bass * p.animAmt * .3; break;
      case 'beat': scale = 1 + a.beat * p.animAmt * .25; break;
      case 'float': dy = Math.sin(t * 1.6) * p.animAmt * st.H * .04; break;
      case 'slide': dy = (1 - Math.min(1, (t - (layer.start || 0)) / .8)) * p.animAmt * st.H * .3; alpha = Math.min(1, (t - (layer.start || 0)) / .5); break;
      case 'fadein': alpha = Math.min(1, (t - (layer.start || 0)) / Math.max(.1, p.animAmt)); break;
      case 'typewriter': {
        const total = st.rawText ? st.rawText.length : 1;
        const cyc = total / Math.max(1, 14 * p.animAmt) + 1.6;
        const tt = (t - (layer.start || 0)) % cyc;
        reveal = U.clamp(tt * Math.max(1, 14 * p.animAmt) / total, 0, 1);
        break;
      }
    }
    return { reveal, dy, alpha, scale };
  };
  const drawTextBlock = (x, st, p, text) => {
    const { W, H } = st;
    const sizePx = p.size * H * 0.015;
    x.font = L.fmtFont(p, sizePx);
    x.textBaseline = 'middle';
    x.textAlign = p.align === 'left' ? 'left' : p.align === 'right' ? 'right' : 'center';
    const maxW = p.wrap * W;
    const lines = [];
    for (const ln of text.split('\n')) {
      if (!ln) { lines.push(''); continue; }
      if (!p.wrap || x.measureText(ln).width <= maxW) { lines.push(ln); continue; }
      const words = ln.split(' '); let cur = '';
      for (const wd of words) {
        const test = cur ? cur + ' ' + wd : wd;
        if (x.measureText(test).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = test;
      }
      if (cur) lines.push(cur);
    }
    const lh = sizePx * p.lineHeight;
    st.rawText = text;
    const anim = textAnim(x, st, p);
    let shown = Math.ceil(text.replace(/\n/g, '').length * anim.reveal);
    x.save();
    x.translate(0, anim.dy);
    x.scale(anim.scale, anim.scale);
    x.globalAlpha *= U.clamp(anim.alpha, 0, 1);
    if (p.shadowBlur > 0) { x.shadowBlur = p.shadowBlur * (H / 1080); x.shadowColor = p.shadowColor; }
    let y = -((lines.length - 1) * lh) / 2;
    for (const ln of lines) {
      let line = ln;
      if (anim.reveal < 1) {
        const take = Math.min(line.length, Math.max(0, shown)); shown -= line.length;
        line = line.slice(0, take);
      }
      const wLine = x.measureText(line).width;
      const lx = x.textAlign === 'left' ? 0 : x.textAlign === 'right' ? 0 : 0;
      if (p.bg) {
        const bw = wLine + p.bgPad * sizePx * 2, bh = lh * .96;
        x.save(); x.shadowBlur = 0;
        x.fillStyle = p.bgColor;
        const bx = x.textAlign === 'left' ? -p.bgPad * sizePx : x.textAlign === 'right' ? -bw + p.bgPad * sizePx : -bw / 2;
        x.beginPath(); x.roundRect ? x.roundRect(bx, y - bh / 2, bw, bh, p.bgRadius * bh) : x.rect(bx, y - bh / 2, bw, bh); x.fill();
        x.restore();
      }
      if (p.gradient) {
        const g = x.createLinearGradient(-wLine / 2, 0, wLine / 2, 0);
        g.addColorStop(0, p.c1); g.addColorStop(1, p.c2);
        x.fillStyle = g;
      } else x.fillStyle = p.c1;
      if (p.letterSpacing && x.letterSpacing !== undefined) x.letterSpacing = `${p.letterSpacing * sizePx / 100}px`;
      x.fillText(line, 0, y);
      if (p.strokeWidth > 0) { x.lineWidth = p.strokeWidth * (H / 1080); x.strokeStyle = p.strokeColor; x.lineJoin = 'round'; x.strokeText(line, 0, y); }
      y += lh;
    }
    if (x.letterSpacing !== undefined) x.letterSpacing = '0px';
    x.restore();
  };
  L.drawTextBlock = drawTextBlock;

  L.register({
    id: 'text', name: 'Text', cat: 'Text', icon: 'text',
    desc: 'Titles and captions with animations',
    defaults: () => ({
      text: 'YOUR TEXT', font: '', weight: 700, italic: false, size: 8, lineHeight: 1.25,
      c1: '#f4f6ff', c2: '#7c5cff', gradient: false, strokeColor: '#000000', strokeWidth: 0,
      align: 'center', wrap: 0, letterSpacing: 0, shadowBlur: 18, shadowColor: '#000000cc',
      anim: 'none', animAmt: 1, bg: false, bgColor: '#00000080', bgPad: .5, bgRadius: .25, uppercase: false
    }),
    params: [
      P.area('text', 'Text'),
      P.sel('font', 'Font', L.fontOptions, ''),
      P.sel('weight', 'Weight', [['300', 'Light'], ['400', 'Regular'], ['600', 'Semi-bold'], ['700', 'Bold'], ['800', 'Extra-bold'], ['900', 'Black']], '700'),
      P.bool('italic', 'Italic'), P.bool('uppercase', 'UPPERCASE'),
      P.num('size', 'Size', .5, 40, .1, 8, { auto: true }),
      P.num('lineHeight', 'Line height', .8, 2.5, .05, 1.25),
      P.num('wrap', 'Wrap width (0 = off)', 0, 2, .02, 0),
      P.num('letterSpacing', 'Letter spacing', -10, 60, 1, 0),
      P.group('Colors', [
        P.bool('gradient', 'Gradient'), P.color('c1', 'Color A'), P.color('c2', 'Color B'),
        P.color('strokeColor', 'Stroke'), P.num('strokeWidth', 'Stroke width', 0, 30, 1, 0),
        P.num('shadowBlur', 'Shadow blur', 0, 80, 1, 18), P.color('shadowColor', 'Shadow color'),
      ]),
      P.group('Background box', [
        P.bool('bg', 'Enabled'), P.color('bgColor', 'Color'),
        P.num('bgPad', 'Padding', 0, 2, .05, .5), P.num('bgRadius', 'Corner radius', 0, 1, .01, .25),
      ]),
      P.group('Animation', [
        P.sel('anim', 'Type', [['none', 'None'], ['pulse', 'Bass pulse'], ['beat', 'Beat pop'], ['float', 'Float'], ['slide', 'Slide in'], ['fadein', 'Fade in'], ['typewriter', 'Typewriter']], 'none'),
        P.num('animAmt', 'Amount', .1, 3, .05, 1),
      ]),
    ],
    draw(x, st) {
      const { p } = st;
      let txt = p.text;
      /* text variables — audio tags, vizzy-style: {title} {artist} {album} {year} {genre} {bpm} {filename} */
      if (txt && txt.includes('{')) {
        const eng = VX.audio && VX.audio.engine;
        const tags = (eng && eng.tags) || {};
        txt = txt.replace(/\{(title|artist|album|year|genre|bpm|filename)\}/g, (m, k) => {
          if (k === 'filename') return (eng && eng.name || '').replace(/\.[^.]+$/, '');
          return tags[k] != null && tags[k] !== '' ? String(tags[k]) : '';
        });
      }
      if (p.uppercase) txt = txt.toUpperCase();
      drawTextBlock(x, st, p, txt);
    }
  });

  /* ============ LYRICS ============ */
  L.parseLRC = (text) => {
    const lines = [];
    const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    for (const raw of text.split(/\r?\n/)) {
      const stamps = [];
      let m; re.lastIndex = 0;
      while ((m = re.exec(raw))) stamps.push(+m[1] * 60 + +m[2] + (+((m[3] || '0').padEnd(3, '0')) / 1000));
      const txt2 = raw.replace(re, '').trim();
      if (stamps.length && txt2) for (const s of stamps) lines.push({ t: s, text: txt2 });
      else if (!stamps.length && txt2 && !/^\[(ar|ti|al|by|offset|re|ve)/i.test(raw)) lines.push({ t: null, text: txt2 });
    }
    lines.sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity));
    return lines;
  };
  L.parseTTML = (text) => {
    try {
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      const out = [];
      doc.querySelectorAll('p').forEach(p => {
        const parse = (s) => {
          if (!s) return null;
          const m = s.match(/(?:(\d+):)?(\d+):(\d+\.?\d*)/);
          return m ? (+m[1] || 0) * 60 + +m[2] + parseFloat(m[3]) : null;
        };
        const t = parse(p.getAttribute('begin'));
        if (t !== null) out.push({ t, text: p.textContent.replace(/\s+/g, ' ').trim() });
      });
      out.sort((a, b) => a.t - b.t);
      if (out.length) return out;
    } catch (e) { }
    return L.parseLRC(text);
  };

  L.register({
    id: 'lyrics', name: 'Lyrics', cat: 'Text', icon: 'lyrics',
    desc: 'Timed lyric lines — karaoke styles, LRC/TTML import, tap-sync',
    defaults: () => ({
      lines: [], font: '', weight: 800, italic: false, size: 6, lineHeight: 1.2,
      c1: '#ffffff', c2: '#7c5cff', gradient: false, strokeColor: '#000000', strokeWidth: 0,
      shadowBlur: 22, shadowColor: '#000000d9', showNext: true, nextSize: .55, nextAlpha: .45,
      style: 'pop', popAmt: .2, holdEnd: 1.5, uppercase: false, speedMul: 1
    }),
    params: [
      P.num('speedMul', 'Timing speed', .25, 4, .05, 1),
      P.act('edit', '✎ Edit lyrics & timing', (l) => VX.ui.openLyricsEditor(l)),
      P.sel('style', 'Line style', [['pop', 'Pop in'], ['fade', 'Fade'], ['slide', 'Slide up'], ['zoom', 'Zoom'], ['karaoke', 'Karaoke sweep']], 'pop'),
      P.num('popAmt', 'Style amount', 0, 1, .01, .2),
      P.bool('showNext', 'Show next line'), P.num('nextSize', 'Next line size', .1, 1, .01, .55), P.num('nextAlpha', 'Next line opacity', 0, 1, .01, .45),
      P.num('size', 'Size', .5, 40, .1, 6, { auto: true }), P.num('lineHeight', 'Line height', .8, 2, .05, 1.2),
      P.sel('font', 'Font', L.fontOptions, ''), P.sel('weight', 'Weight', [['300', 'Light'], ['400', 'Regular'], ['600', 'Semi-bold'], ['700', 'Bold'], ['800', 'Extra-bold'], ['900', 'Black']], '800'),
      P.bool('italic', 'Italic'), P.bool('uppercase', 'UPPERCASE'),
      P.color('c1', 'Color'), P.bool('gradient', 'Gradient'), P.color('c2', 'Gradient B'),
      P.color('strokeColor', 'Stroke'), P.num('strokeWidth', 'Stroke width', 0, 30, 1, 0),
      P.num('shadowBlur', 'Shadow blur', 0, 80, 1, 22), P.color('shadowColor', 'Shadow color'),
    ],
    draw(x, st) {
      const { p, t, H } = st;
      const lines = (p.lines || []).filter(l => l.t !== null && l.t !== undefined).sort((a, b) => a.t - b.t);
      if (!lines.length) {
        x.fillStyle = '#5b6478'; x.font = `${30 * H / 1080}px sans-serif`; x.textAlign = 'center';
        x.fillText('✎ Edit lyrics & timing →', 0, 10);
        return;
      }
      const tt = t * (p.speedMul || 1);
      let idx = -1;
      for (let i = 0; i < lines.length; i++) if (lines[i].t <= tt + .001) idx = i;
      const cur = idx >= 0 ? lines[idx] : null;
      const nxt = idx + 1 < lines.length ? lines[idx + 1] : null;
      let prog = 0, lineT = 0;
      if (cur) {
        lineT = tt - cur.t;
        const span = nxt ? nxt.t - cur.t : 4;
        prog = U.clamp(lineT / Math.max(.2, span), 0, 1);
      }
      x.save();
      const drawLine = (text, sizeMul, alpha, isCur) => {
        if (!text) return;
        const pp = { ...p, size: p.size * sizeMul, uppercase: p.uppercase };
        const txt2 = p.uppercase ? text.toUpperCase() : text;
        x.save();
        x.globalAlpha *= alpha;
        let dy = 0, sc = 1;
        if (isCur && cur) {
          const a0 = U.clamp(lineT / .28, 0, 1);
          if (p.style === 'pop') { sc = 1 + (1 - a0) * p.popAmt * 1.4; x.globalAlpha *= a0; }
          else if (p.style === 'fade') x.globalAlpha *= a0;
          else if (p.style === 'slide') { dy = (1 - a0) * H * .09; x.globalAlpha *= a0; }
          else if (p.style === 'zoom') { sc = .8 + .2 * a0; x.globalAlpha *= a0; }
        }
        x.translate(0, dy); x.scale(sc, sc);
        if (isCur && p.style === 'karaoke') {
          const sizePx = pp.size * H / 100 * 5.4;
          x.font = L.fmtFont(pp, sizePx); x.textBaseline = 'middle'; x.textAlign = 'center';
          const wAll = x.measureText(txt2).width;
          if (p.gradient) { const g = x.createLinearGradient(-wAll / 2, 0, wAll / 2, 0); g.addColorStop(0, p.c1); g.addColorStop(1, p.c2); x.fillStyle = g; } else x.fillStyle = p.c1;
          if (p.shadowBlur) { x.shadowBlur = p.shadowBlur * (H / 1080); x.shadowColor = p.shadowColor; }
          x.fillText(txt2, 0, 0);
          x.save();
          x.beginPath(); x.rect(-wAll / 2, -H, wAll * prog, H * 2); x.clip();
          x.fillStyle = p.strokeWidth > 0 ? p.strokeColor : U.shade(p.c1, .6);
          x.shadowColor = U.shade(p.c1, .5); x.fillText(txt2, 0, 0);
          x.restore();
        } else {
          drawTextBlock(x, st, pp, txt2);
        }
        x.restore();
      };
      if (p.showNext && nxt) drawLine(nxt.text, p.nextSize, p.nextAlpha, false);
      drawLine(cur ? cur.text : '', 1, 1, true);
      x.restore();
    }
  });

  /* ============ PROGRESS BAR ============ */
  L.register({
    id: 'progress', name: 'Progress Bar', cat: 'Decor', icon: 'clock',
    desc: 'Song progress indicator with time labels',
    defaults: () => ({ style: 'bar', width: .6, height: .014, trackColor: '#ffffff26', c1: '#7c5cff', c2: '#22d3ee', radius: 1, knob: true, knobColor: '#ffffff', showTime: true, timeSize: 1.4, timeColor: '#ffffffb0', pulse: 0, invert: false }),
    params: [
      P.sel('style', 'Style', [['bar', 'Bar'], ['line', 'Thin line'], ['dots', 'Dots']], 'bar'),
      P.num('width', 'Width', .05, 2, .01, .6, { auto: true }),
      P.num('height', 'Height', .002, .1, .001, .014),
      P.color('trackColor', 'Track color'), P.color('c1', 'Fill A'), P.color('c2', 'Fill B'),
      P.num('radius', 'Corner radius', 0, 1, .01, 1),
      P.bool('knob', 'Knob'), P.color('knobColor', 'Knob color'),
      P.bool('showTime', 'Show time labels'), P.num('timeSize', 'Label size', .5, 5, .1, 1.4), P.color('timeColor', 'Label color'),
      P.num('pulse', 'Bass pulse', 0, 1, .05, 0), P.bool('invert', 'Fill from right'),
    ],
    draw(x, st) {
      const { W, H, p, a, time, duration } = st;
      const w = p.width * W, h = Math.max(2, p.height * H * (1 + a.bass * p.pulse * .6));
      const prog = duration > 0 ? U.clamp(time / duration, 0, 1) : 0;
      const pw = p.invert ? 1 - prog : prog;
      let hh;
      x.save();
      if (p.style === 'dots') {
        const n = 28, r = Math.min(h, w / (n * 2.6));
        hh = r * 2;
        for (let i = 0; i < n; i++) {
          const cx = -w / 2 + (i + .5) * w / n;
          const on = i / (n - 1) <= pw;
          x.fillStyle = on ? U.lerpColor(p.c1, p.c2, i / n) : p.trackColor;
          x.beginPath(); x.arc(cx, 0, on ? r * (1 + a.beat * .2) : r * .7, 0, 7); x.fill();
        }
      } else {
        hh = p.style === 'line' ? Math.max(2, h * .35) : h;
        const r = p.radius * hh / 2;
        x.fillStyle = p.trackColor;
        x.beginPath(); x.roundRect ? x.roundRect(-w / 2, -hh / 2, w, hh, r) : x.rect(-w / 2, -hh / 2, w, hh); x.fill();
        const g = x.createLinearGradient(p.invert ? w / 2 : -w / 2, 0, p.invert ? -w / 2 : w / 2, 0);
        g.addColorStop(0, p.c1); g.addColorStop(1, p.c2);
        x.fillStyle = g;
        x.beginPath(); x.roundRect ? x.roundRect(-w / 2, -hh / 2, Math.max(hh, w * pw), hh, r) : x.rect(-w / 2, -hh / 2, Math.max(hh, w * pw), hh); x.fill();
        if (p.knob) {
          const kx = -w / 2 + w * pw;
          x.fillStyle = p.knobColor;
          x.shadowBlur = hh * 2; x.shadowColor = p.c2;
          x.beginPath(); x.arc(kx, 0, hh * .9, 0, 7); x.fill();
        }
      }
      if (p.showTime) {
        const fs = p.timeSize * H / 40;
        x.font = `600 ${fs}px sans-serif`; x.fillStyle = p.timeColor; x.textBaseline = 'top';
        x.textAlign = 'left'; x.fillText(U.fmtTime(time).replace(/\.\d+/, ''), -w / 2, hh + fs * .5);
        x.textAlign = 'right'; x.fillText(U.fmtTime(duration || 0).replace(/\.\d+/, ''), w / 2, hh + fs * .5);
      }
      x.restore();
    }
  });
})();
