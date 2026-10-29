/* Vlexyna — fx.js — per-layer / global effect stack engine */
'use strict';
(() => {
  const P = VX.P, FX = VX.fx = { list: [], byId: {} };
  FX.register = (def) => { FX.list.push(def); FX.byId[def.id] = def; return def; };
  FX.defaults = (def) => { const o = {}; for (const p of def.params) if (p.t !== 'group' && p.t !== 'act') o[p.key] = p.def; return o; };
  FX.make = (id) => ({ id, enabled: true, params: FX.defaults(FX.byId[id]) });

  /* scratch buffers for effect chaining */
  const scratch = [];
  const getScratch = (i, w, h) => {
    if (!scratch[i]) scratch[i] = { c: document.createElement('canvas'), x: null };
    const s = scratch[i];
    if (s.c.width !== w || s.c.height !== h) { s.c.width = w; s.c.height = h; }
    s.x = s.c.getContext('2d');
    s.x.setTransform(1, 0, 0, 1, 0, 0); s.x.globalAlpha = 1; s.x.globalCompositeOperation = 'source-over'; s.x.filter = 'none'; s.x.clearRect(0, 0, w, h);
    return s;
  };

  /* run a chain: srcIn (canvas) -> returns canvas after all effects */
  FX.apply = (src, chain, st) => {
    let cur = src;
    let i = 0;
    for (const fx of chain) {
      if (!fx || !fx.enabled) continue;
      const def = FX.byId[fx.id]; if (!def) continue;
      const dst = getScratch((i++) % 2, cur.width, cur.height);
      if (dst.c === cur) continue; /* never draw a buffer onto itself */
      try { def.apply(dst.x, dst.c, cur, fx.params, st); } catch (e) { /* effect failed: pass through */ }
      cur = dst.c;
    }
    return cur;
  };

  let noiseTile = null;
  const getNoise = () => {
    if (noiseTile) return noiseTile;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), d = x.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); noiseTile = c; return c;
  };

  /* ============ EFFECTS ============ */

  FX.register({
    id: 'glow', name: 'Glow', cat: 'Light',
    params: [P.num('radius', 'Radius', 0, 120, 1, 30), P.color('color', 'Color', '#7c5cff'), P.num('intensity', 'Intensity', 0, 3, .05, 1), P.sel('blend', 'Blend', [['lighter', 'Add'], ['source-over', 'Normal']], 'lighter')],
    apply(x, dst, src, p) {
      const n = Math.max(1, Math.ceil(p.intensity));
      x.globalCompositeOperation = p.blend;
      for (let i = 0; i < n; i++) {
        x.globalAlpha = Math.min(1, p.intensity / n);
        x.shadowBlur = p.radius; x.shadowColor = p.color;
        x.drawImage(src, 0, 0);
        x.shadowBlur = 0; x.shadowColor = 'transparent';
      }
    }
  });

  FX.register({
    id: 'blur', name: 'Gaussian Blur', cat: 'Blur',
    params: [P.num('radius', 'Radius', 0, 80, .5, 8), P.num('quality', 'Quality', 1, 3, 1, 1)],
    apply(x, dst, src, p) { x.filter = `blur(${p.radius}px)`; x.drawImage(src, 0, 0); x.filter = 'none'; }
  });

  FX.register({
    id: 'boxblur', name: 'Box Blur', cat: 'Blur',
    params: [P.num('radius', 'Radius', 1, 40, 1, 8)],
    apply(x, dst, src, p) {
      const r = Math.round(p.radius), n = Math.min(24, r * 2 + 1);
      x.globalAlpha = 1 / (r + 1);
      for (let i = -r; i <= r; i += Math.max(1, Math.floor(r / 6) || 1)) { x.drawImage(src, i, 0); x.drawImage(src, 0, i); }
      x.globalAlpha = 1;
    }
  });

  FX.register({
    id: 'directional', name: 'Directional Blur', cat: 'Blur',
    params: [P.num('angle', 'Angle', 0, 360, 1, 0, { auto: true }), P.num('distance', 'Distance', 0, 120, 1, 20), P.num('steps', 'Steps', 2, 24, 1, 10)],
    apply(x, dst, src, p) {
      const a = p.angle * Math.PI / 180, n = Math.round(p.steps), d = p.distance;
      x.globalAlpha = 1 / (n + 1);
      for (let i = 1; i <= n; i++) x.drawImage(src, Math.cos(a) * d * i / n, Math.sin(a) * d * i / n);
      x.globalAlpha = 1;
    }
  });

  FX.register({
    id: 'radialblur', name: 'Radial (Zoom) Blur', cat: 'Blur',
    params: [P.num('amount', 'Amount', 0, 0.4, .005, .08), P.num('steps', 'Steps', 2, 24, 1, 10), P.num('cx', 'Center X', 0, 1, .01, .5), P.num('cy', 'Center Y', 0, 1, .01, .5)],
    apply(x, dst, src, p) {
      const w = src.width, h = src.height, n = Math.round(p.steps);
      const cx = p.cx * w, cy = p.cy * h;
      x.globalAlpha = 1 / (n + 1);
      for (let i = 1; i <= n; i++) {
        const s = 1 + p.amount * i / n;
        x.drawImage(src, cx - cx * s, cy - cy * s, w * s, h * s);
      }
      x.globalAlpha = 1;
    }
  });

  FX.register({
    id: 'channelshift', name: 'Channel Shift (RGB split)', cat: 'Stylize',
    params: [P.num('offsetX', 'Offset X', -60, 60, 1, 6), P.num('offsetY', 'Offset Y', -60, 60, 1, 0), P.sel('mode', 'Blend', [['screen', 'Screen'], ['lighter', 'Add']], 'screen')],
    apply(x, dst, src, p) {
      const w = src.width, h = src.height;
      x.globalCompositeOperation = p.mode;
      x.drawImage(src, 0, 0);
      /* tinted copies isolate channels via multiply on scratch */
      const s2 = getScratch(2, w, h), s3 = getScratch(3, w, h);
      s2.x.drawImage(src, 0, 0); s2.x.globalCompositeOperation = 'multiply'; s2.x.fillStyle = '#ff0000'; s2.x.fillRect(0, 0, w, h);
      s3.x.drawImage(src, 0, 0); s3.x.globalCompositeOperation = 'multiply'; s3.x.fillStyle = '#0000ff'; s3.x.fillRect(0, 0, w, h);
      x.drawImage(s2.c, p.offsetX, p.offsetY);
      x.drawImage(s3.c, -p.offsetX, -p.offsetY);
    }
  });

  FX.register({
    id: 'vignette', name: 'Vignette', cat: 'Stylize',
    params: [P.num('strength', 'Strength', 0, 1, .01, .45), P.num('size', 'Size', .2, 1.6, .01, 1), P.color('color', 'Color', '#000000')],
    apply(x, dst, src, p) {
      x.drawImage(src, 0, 0);
      const w = dst.width, h = dst.height, m = Math.max(w, h);
      const g = x.createRadialGradient(w / 2, h / 2, m * .2 * p.size, w / 2, h / 2, m * .75 * p.size);
      const [r, gg, b] = U.hex2rgb(p.color);
      g.addColorStop(0, `rgba(${r},${gg},${b},0)`); g.addColorStop(1, `rgba(${r},${gg},${b},${p.strength})`);
      x.globalCompositeOperation = 'source-atop'; /* only tint existing pixels */
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
    }
  });

  FX.register({
    id: 'edge', name: 'Edge Detection', cat: 'Stylize',
    params: [P.num('strength', 'Strength', .1, 3, .05, 1), P.color('color', 'Tint', '#ffffff'), P.bool('invert', 'Invert', false)],
    apply(x, dst, src, p) {
      const w = src.width, h = src.height;
      const sx = src.getContext('2d'), im = sx.getImageData(0, 0, w, h), d = im.data;
      const out = x.createImageData(w, h), o = out.data;
      const [tr, tg, tb] = U.hex2rgb(p.color);
      const k = p.strength;
      for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) {
        const i = (y * w + xx) * 4;
        const gx = (d[i - 4] - d[i + 4]) * .5 + (d[i - w * 4 - 4] + d[i - w * 4] * 2 + d[i - w * 4 + 4] - d[i + w * 4 - 4] - d[i + w * 4] * 2 - d[i + w * 4 + 4]) * .25;
        const gy = (d[i - w * 4] - d[i + w * 4]) * .5 + (d[i - w * 4 - 4] + d[i - 4] * 2 + d[i + w * 4 - 4] - d[i - w * 4 + 4] - d[i + 4] * 2 - d[i + w * 4 + 4]) * .25;
        const v = U.clamp(Math.hypot(gx, gy) * k / 100, 0, 1);
        const a = p.invert ? 1 - v : v;
        o[i] = tr * a; o[i + 1] = tg * a; o[i + 2] = tb * a; o[i + 3] = d[i + 3] > 0 ? 255 : 0;
      }
      x.putImageData(out, 0, 0);
    }
  });

  FX.register({
    id: 'pixelate', name: 'Pixelate', cat: 'Stylize',
    params: [P.num('size', 'Pixel size', 2, 80, 1, 12)],
    apply(x, dst, src, p) {
      const w = src.width, h = src.height, s = Math.max(2, Math.round(p.size));
      const sw = Math.max(1, Math.round(w / s)), sh = Math.max(1, Math.round(h / s));
      x.imageSmoothingEnabled = true;
      x.drawImage(src, 0, 0, sw, sh);
      x.imageSmoothingEnabled = false;
      x.drawImage(dst, 0, 0, sw, sh, 0, 0, w, h);
      x.imageSmoothingEnabled = true;
    }
  });

  FX.register({
    id: 'grain', name: 'Film Grain', cat: 'Stylize',
    params: [P.num('amount', 'Amount', 0, 1, .01, .25), P.num('size', 'Grain size', 1, 8, 1, 1)],
    apply(x, dst, src, p, st) {
      x.drawImage(src, 0, 0);
      const n = getNoise(), w = dst.width, h = dst.height;
      x.globalCompositeOperation = 'overlay';
      x.globalAlpha = p.amount;
      const s = 128 * Math.max(1, p.size), ox = (st ? st.t * 60 : 0) % 128;
      for (let yy = -128; yy < h + 128; yy += s) for (let xx = -128; xx < w + 128; xx += s) x.drawImage(n, xx + ox, yy + ((st ? st.t * 97 : 0) % 128));
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
  });

  FX.register({
    id: 'scanlines', name: 'Scanlines (CRT)', cat: 'Stylize',
    params: [P.num('spacing', 'Spacing', 2, 24, 1, 4), P.num('intensity', 'Intensity', 0, 1, .01, .35), P.color('color', 'Color', '#000000'), P.num('speed', 'Scroll speed', -4, 4, .1, 0, { auto: true })],
    apply(x, dst, src, p, st) {
      x.drawImage(src, 0, 0);
      const w = dst.width, h = dst.height, sp = Math.round(p.spacing);
      const off = Math.floor((st ? st.t : 0) * p.speed * 60) % sp;
      const [r, g, b] = U.hex2rgb(p.color);
      x.globalCompositeOperation = 'source-atop'; /* only shade existing pixels */
      x.fillStyle = `rgba(${r},${g},${b},${p.intensity})`;
      for (let y = -sp + off; y < h; y += sp) x.fillRect(0, y, w, Math.max(1, sp / 2));
      x.globalCompositeOperation = 'source-over';
    }
  });

  FX.register({
    id: 'color', name: 'Color Correct', cat: 'Color',
    params: [P.num('brightness', 'Brightness', 0, 3, .01, 1), P.num('contrast', 'Contrast', 0, 3, .01, 1), P.num('saturate', 'Saturation', 0, 3, .01, 1), P.num('hue', 'Hue shift', -180, 180, 1, 0, { auto: true }), P.bool('invert', 'Invert', false), P.num('sepia', 'Sepia', 0, 1, .01, 0)],
    apply(x, dst, src, p) {
      x.filter = `brightness(${p.brightness}) contrast(${p.contrast}) saturate(${p.saturate}) hue-rotate(${p.hue}deg)${p.invert ? ' invert(1)' : ''}${p.sepia ? ` sepia(${p.sepia})` : ''}`;
      x.drawImage(src, 0, 0); x.filter = 'none';
    }
  });

  FX.register({
    id: 'gradmap', name: 'Gradient Map', cat: 'Color',
    params: [P.color('shadow', 'Shadows', '#120b2e'), P.color('mid', 'Midtones', '#7c5cff'), P.color('high', 'Highlights', '#f8f6ff'), P.num('mix', 'Mix', 0, 1, .01, 1)],
    apply(x, dst, src, p) {
      const w = src.width, h = src.height;
      const im = src.getContext('2d').getImageData(0, 0, w, h), d = im.data;
      const A = U.hex2rgb(p.shadow), B = U.hex2rgb(p.mid), C = U.hex2rgb(p.high);
      for (let i = 0; i < d.length; i += 4) {
        const l = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255;
        let r, g, b;
        if (l < .5) { const t = l * 2; r = U.lerp(A[0], B[0], t); g = U.lerp(A[1], B[1], t); b = U.lerp(A[2], B[2], t); }
        else { const t = l * 2 - 1; r = U.lerp(B[0], C[0], t); g = U.lerp(B[1], C[1], t); b = U.lerp(B[2], C[2], t); }
        d[i] = U.lerp(d[i], r, p.mix); d[i + 1] = U.lerp(d[i + 1], g, p.mix); d[i + 2] = U.lerp(d[i + 2], b, p.mix);
      }
      x.putImageData(im, 0, 0);
    }
  });

  FX.register({
    id: 'shadow', name: 'Drop Shadow', cat: 'Light',
    params: [P.num('offsetX', 'Offset X', -100, 100, 1, 0, { auto: true }), P.num('offsetY', 'Offset Y', -100, 100, 1, 12), P.num('blur', 'Blur', 0, 100, 1, 20), P.color('color', 'Color', '#000000'), P.num('alpha', 'Opacity', 0, 1, .01, .6)],
    apply(x, dst, src, p) {
      const w = src.width, h = src.height;
      const s2 = getScratch(2, w, h);
      s2.x.drawImage(src, 0, 0);
      s2.x.globalCompositeOperation = 'source-in';
      s2.x.fillStyle = p.color; s2.x.fillRect(0, 0, w, h);
      x.globalAlpha = p.alpha; x.shadowBlur = 0;
      x.drawImage(s2.c, p.offsetX, p.offsetY);
      x.globalAlpha = 1; x.drawImage(src, 0, 0);
    }
  });

  FX.register({
    id: 'skew', name: 'Skew', cat: 'Transform',
    params: [P.num('skx', 'Skew X', -1, 1, .01, 0, { auto: true }), P.num('sky', 'Skew Y', -1, 1, .01, 0, { auto: true })],
    apply(x, dst, src, p) {
      const w = dst.width, h = dst.height;
      x.setTransform(1, p.sky, p.skx, 1, -p.sky * 0, 0);
      x.translate((Math.abs(p.skx) * h) / 2 * (p.skx > 0 ? -1 : 1) * 0, 0);
      x.drawImage(src, 0, 0);
      x.setTransform(1, 0, 0, 1, 0, 0);
    }
  });

  FX.register({
    id: 'mirrorfx', name: 'Mirror', cat: 'Transform',
    params: [P.sel('mode', 'Mode', [['h', 'Horizontal'], ['v', 'Vertical'], ['quad', 'Quad']], 'h'), P.num('splitX', 'Split X', 0, 1, .01, .5), P.num('splitY', 'Split Y', 0, 1, .01, .5), P.num('fade', 'Blend edge', 0, 1, .01, 0)],
    apply(x, dst, src, p) {
      const w = dst.width, h = dst.height;
      x.drawImage(src, 0, 0);
      if (p.mode === 'h' || p.mode === 'quad') {
        x.save(); x.translate(p.splitX * 2 * w, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); x.restore();
      }
      if (p.mode === 'v' || p.mode === 'quad') {
        x.save(); x.translate(0, p.splitY * 2 * h); x.scale(1, -1); x.drawImage(src, 0, 0); x.restore();
      }
    }
  });
})();
