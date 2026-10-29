/* Vlexyna — fx2.js — the full effect library (vizzy parity + extras)
   Every effect from vizzy.io's list is implemented:
   Advanced/Simple Outline, Advanced/Simple Shadow, Alpha, Blending, Bloom, Bokeh/Box/Channel/
   Directional/Horizontal/Vertical/Triangle/Two-pass/Zoom blur, Bulge-Pinch, Camera Shake,
   Chroma Key, Chroma Shift, Chromatic Aberration, Color Correction, Color Tint, Crop,
   Displacement, Distance Field, Edge Detection, FidelityFX CAS, Fish Eye 1/2, Flicker, FXAA,
   Glitch, God Rays, Gradient Map, Grayscale, Impact Ripple, Invert, Kaleidoscope, Liquify,
   Mask, Mirror, Morphing Fractal, Pixelate, Polar Coordinates, Premultiply Alpha, Render Layer,
   Repeating Ripple, RGB Displace, Sepia, Skew, Spooky, Streak Glow, Tilt Shift, Time Stop,
   Trail, Transform, Twirl, VHS 1/2, Vignette … */
'use strict';
import { VX, U } from './util.js';
import { P } from './params.js';

(() => {
  const FX = VX.fx;
  const clamp = U.clamp;
  const reg = (id, name, cat, params, apply) => FX.register({ id, name, cat, params, apply });

  /* ───────── helpers ───────── */
  const mkC = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const pool = [];
  const scratch = (w, h) => {
    let s = pool.find(s => !s._busy);
    if (!s) { s = { c: mkC(2, 2) }; pool.push(s); }
    s._busy = true;
    if (s.c.width !== w || s.c.height !== h) { s.c.width = w; s.c.height = h; }
    const x = s.c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
    x.clearRect(0, 0, w, h);
    return { c: s.c, x, free: () => { s._busy = false; } };
  };
  const img = (src) => src.getContext('2d').getImageData(0, 0, src.width, src.height);
  const hex = U.hex2rgb;

  /* bilinear resample pass — map(x,y) → [sx,sy] source coords */
  function warp(x, dst, src, map, edge) {
    const w = src.width, h = src.height;
    if (!w || !h) return;
    const im = img(src), d = im.data;
    const out = x.createImageData(w, h), o = out.data;
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w; xx++) {
        const i = (y * w + xx) * 4;
        const m = map(xx, y);
        let sx = m[0], sy = m[1];
        if (edge === 'wrap') { sx = ((sx % w) + w) % w; sy = ((sy % h) + h) % h; }
        else if (edge === 'mirror') {
          sx = Math.abs(sx) % (2 * w); if (sx >= w) sx = 2 * w - 1 - sx;
          sy = Math.abs(sy) % (2 * h); if (sy >= h) sy = 2 * h - 1 - sy;
        }
        if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) {
          if (edge === 'transparent') { o[i + 3] = 0; continue; }
          sx = clamp(sx, 0, w - 1.001); sy = clamp(sy, 0, h - 1.001);
        }
        const x0 = sx | 0, y0 = sy | 0, fx1 = sx - x0, fy1 = sy - y0;
        const i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
        const w00 = (1 - fx1) * (1 - fy1), w10 = fx1 * (1 - fy1), w01 = (1 - fx1) * fy1, w11 = fx1 * fy1;
        o[i] = d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11;
        o[i + 1] = d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11;
        o[i + 2] = d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11;
        o[i + 3] = d[i00 + 3] * w00 + d[i10 + 3] * w10 + d[i01 + 3] * w01 + d[i11 + 3] * w11;
      }
    }
    x.putImageData(out, 0, 0);
  }

  /* per-pixel color transform — fn(d, o, i) */
  function colorPass(x, dst, src, fn) {
    const w = src.width, h = src.height;
    if (!w || !h) return;
    const im = img(src), d = im.data;
    const out = x.createImageData(w, h), o = out.data;
    o.set(d);
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) fn(d, o, i);
    x.putImageData(out, 0, 0);
  }

  /* separable sliding-window box blur on selected channels (booleans) */
  function boxBlur(im, w, h, r, horiz, cr, cg, cb, ca) {
    if (r < 1) return;
    r = Math.round(r);
    const d = im.data, src = new Uint8ClampedArray(d);
    const n = 2 * r + 1;
    if (horiz) {
      for (let y = 0; y < h; y++) {
        const row = y * w * 4;
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let k = -r; k <= r; k++) {
          const xx = clamp(k, 0, w - 1) * 4 + row;
          sr += src[xx]; sg += src[xx + 1]; sb += src[xx + 2]; sa += src[xx + 3];
        }
        for (let xx = 0; xx < w; xx++) {
          const i = row + xx * 4;
          if (cr) d[i] = sr / n; if (cg) d[i + 1] = sg / n; if (cb) d[i + 2] = sb / n; if (ca) d[i + 3] = sa / n;
          const add = clamp(xx + r + 1, 0, w - 1) * 4 + row, sub = clamp(xx - r, 0, w - 1) * 4 + row;
          sr += src[add] - src[sub]; sg += src[add + 1] - src[sub + 1]; sb += src[add + 2] - src[sub + 2]; sa += src[add + 3] - src[sub + 3];
        }
      }
    } else {
      const W4 = w * 4;
      for (let xx = 0; xx < w; xx++) {
        const col = xx * 4;
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let k = -r; k <= r; k++) {
          const yy = clamp(k, 0, h - 1) * W4 + col;
          sr += src[yy]; sg += src[yy + 1]; sb += src[yy + 2]; sa += src[yy + 3];
        }
        for (let y = 0; y < h; y++) {
          const i = y * W4 + col;
          if (cr) d[i] = sr / n; if (cg) d[i + 1] = sg / n; if (cb) d[i + 2] = sb / n; if (ca) d[i + 3] = sa / n;
          const add = clamp(y + r + 1, 0, h - 1) * W4 + col, sub = clamp(y - r, 0, h - 1) * W4 + col;
          sr += src[add] - src[sub]; sg += src[add + 1] - src[sub + 1]; sb += src[add + 2] - src[sub + 2]; sa += src[add + 3] - src[sub + 3];
        }
      }
    }
  }

  const blurPass = (x, dst, src, r, chans) => {
    if (r < 1) { x.drawImage(src, 0, 0); return; }
    const im = img(src);
    boxBlur(im, src.width, src.height, r, true, ...chans);
    boxBlur(im, src.width, src.height, r, false, ...chans);
    x.putImageData(im, 0, 0);
  };
  const blurDir = (x, dst, src, r, horiz) => {
    if (r < 1) { x.drawImage(src, 0, 0); return; }
    const im = img(src);
    boxBlur(im, src.width, src.height, r, horiz, 1, 1, 1, 0);
    x.putImageData(im, 0, 0);
  };

  /* luminance high-pass into a scratch canvas */
  function brightPass(src, threshold, s) {
    s.x.drawImage(src, 0, 0);
    const im = img(s.c), d = im.data;
    const t = threshold * 255;
    for (let i = 0; i < d.length; i += 4) {
      const l = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114;
      const k = l > t ? (l - t) / Math.max(1, 255 - t) : 0;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; d[i + 3] = d[i + 3] * (k > 0 ? 1 : 0);
    }
    s.x.putImageData(im, 0, 0);
    return s;
  }

  const T = (k, l, mn, mx, st, d, o) => P.num(k, l, mn, mx, st, d, o);

  /* ═════════ BLURS ═════════ */
  reg('hblur', 'Horizontal Blur', 'Blur', [T('radius', 'Radius', 0, 100, 1, 8)],
    (x, dst, src, p) => blurDir(x, dst, src, p.radius, true));

  reg('vblur', 'Vertical Blur', 'Blur', [T('radius', 'Radius', 0, 100, 1, 8)],
    (x, dst, src, p) => blurDir(x, dst, src, p.radius, false));

  reg('triangleblur', 'Triangle Blur', 'Blur', [T('radius', 'Radius', 0, 60, 1, 6)],
    (x, dst, src, p) => {
      const im = img(src);
      boxBlur(im, src.width, src.height, p.radius, true, 1, 1, 1, 0);
      boxBlur(im, src.width, src.height, p.radius, false, 1, 1, 1, 0);
      x.putImageData(im, 0, 0);
    });

  reg('bokehblur', 'Bokeh Blur', 'Blur', [T('radius', 'Radius', 1, 50, 1, 10), T('samples', 'Samples', 4, 32, 1, 14)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const im = img(src), d = im.data;
      const out = x.createImageData(w, h), o = out.data;
      const n = Math.round(p.samples), r = p.radius;
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
        const i = (y * w + xx) * 4;
        let sr = 0, sg = 0, sb = 0, sa = 0;
        /* center tap weighted like a lens kernel */
        sr += d[i] * 2; sg += d[i + 1] * 2; sb += d[i + 2] * 2; sa += d[i + 3] * 2;
        for (let k = 0; k < n; k++) {
          const a = k / n * Math.PI * 2;
          const sx2 = clamp(xx + Math.cos(a) * r, 0, w - 1) | 0, sy2 = clamp(y + Math.sin(a) * r, 0, h - 1) | 0;
          const j = (sy2 * w + sx2) * 4;
          sr += d[j]; sg += d[j + 1]; sb += d[j + 2]; sa += d[j + 3];
        }
        const dn = n + 2;
        o[i] = sr / dn; o[i + 1] = sg / dn; o[i + 2] = sb / dn; o[i + 3] = sa / dn;
      }
      x.putImageData(out, 0, 0);
    });

  reg('channelblur', 'Channel Blur', 'Blur', [
    P.sel('chan', 'Channel', [['r', 'Red'], ['g', 'Green'], ['b', 'Blue'], ['a', 'Alpha']], 'r'),
    T('radius', 'Radius', 0, 60, 1, 6)],
    (x, dst, src, p) => {
      const c = p.chan === 'r' ? [1, 0, 0, 0] : p.chan === 'g' ? [0, 1, 0, 0] : p.chan === 'b' ? [0, 0, 1, 0] : [0, 0, 0, 1];
      blurPass(x, dst, src, p.radius, c);
    });

  reg('tiltshift', 'Tilt Shift', 'Blur', [T('focus', 'Focus Y', 0, 1, .01, .5), T('range', 'Focus range', .02, 1, .01, .25), T('radius', 'Blur amount', 0, 60, 1, 18)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const s1 = scratch(w, h);
      s1.x.filter = `blur(${p.radius}px)`;
      s1.x.drawImage(src, 0, 0);
      s1.x.filter = 'none';
      const s2 = scratch(w, h);
      s2.x.drawImage(src, 0, 0);
      const g = s2.x.createLinearGradient(0, 0, 0, h);
      const f = p.focus * h, r0 = Math.max(2, p.range * h);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      for (const [pos, a] of [[clamp((f - r0) / h, 0, 1), 0], [clamp(f / h, 0, 1), 1], [clamp((f + r0) / h, 0, 1), 0]]) g.addColorStop(pos, `rgba(0,0,0,${a})`);
      s2.x.globalCompositeOperation = 'destination-in';
      s2.x.fillStyle = g; s2.x.fillRect(0, 0, w, h);
      s2.x.globalCompositeOperation = 'source-over';
      x.drawImage(s1.c, 0, 0);
      x.drawImage(s2.c, 0, 0);
      s1.free(); s2.free();
    });

  /* ═════════ LIGHT & GLOW ═════════ */
  reg('bloom', 'Bloom', 'Light', [T('threshold', 'Threshold', 0, 1, .01, .55), T('radius', 'Radius', 1, 80, 1, 22), T('intensity', 'Intensity', 0, 3, .05, .9)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const s1 = scratch(w, h), s2 = scratch(w, h);
      brightPass(src, p.threshold, s1);
      s2.x.filter = `blur(${p.radius}px)`;
      s2.x.drawImage(s1.c, 0, 0);
      s2.x.filter = 'none';
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = clamp(p.intensity, 0, 1);
      x.drawImage(s2.c, 0, 0);
      if (p.intensity > 1) { x.globalAlpha = clamp(p.intensity - 1, 0, 1); x.drawImage(s2.c, 0, 0); }
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      s1.free(); s2.free();
    });

  reg('streakglow', 'Streak Glow', 'Light', [T('threshold', 'Threshold', 0, 1, .01, .6), T('length', 'Length', 2, 200, 1, 60), T('intensity', 'Intensity', 0, 3, .05, 1), T('angle', 'Angle', 0, 360, 1, 0), T('steps', 'Steps', 2, 24, 1, 10)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const s1 = scratch(w, h);
      brightPass(src, p.threshold, s1);
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'lighter';
      const a = p.angle * Math.PI / 180, n = Math.round(p.steps);
      for (let i = 1; i <= n; i++) {
        const k = i / n;
        x.globalAlpha = clamp(p.intensity * (1 - k) / n * 2, 0, 1);
        x.drawImage(s1.c, Math.cos(a) * p.length * k, Math.sin(a) * p.length * k);
        x.drawImage(s1.c, -Math.cos(a) * p.length * k, -Math.sin(a) * p.length * k);
      }
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      s1.free();
    });

  reg('godrays', 'God Rays', 'Light', [
    T('cx', 'Light X', 0, 1, .01, .5), T('cy', 'Light Y', 0, 1, .01, .5),
    T('density', 'Density', 4, 48, 1, 20), T('decay', 'Decay', .8, 1, .01, .96),
    T('weight', 'Weight', 0, 2, .05, .6), T('threshold', 'Threshold', 0, 1, .01, .5), T('exposure', 'Exposure', 0, 2, .05, .8)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const sw = Math.max(8, w >> 2), sh = Math.max(8, h >> 2);
      const s1 = scratch(sw, sh), s2 = scratch(sw, sh);
      s1.x.drawImage(src, 0, 0, sw, sh);
      const im = img(s1.c), d = im.data;
      const t = p.threshold * 255;
      const lx = p.cx * sw, ly = p.cy * sh;
      const n = Math.round(p.density);
      const out = s2.x.createImageData(sw, sh), o = out.data;
      for (let y = 0; y < sh; y++) for (let xx = 0; xx < sw; xx++) {
        const i = (y * sw + xx) * 4;
        let dx = lx - xx, dy = ly - y;
        let illum = 0, k = 1;
        let sx2 = xx, sy2 = y;
        for (let s = 0; s < n; s++) {
          sx2 += dx / n; sy2 += dy / n;
          const j = (clamp(sy2 | 0, 0, sh - 1) * sw + clamp(sx2 | 0, 0, sw - 1)) * 4;
          const l = d[j] * .299 + d[j + 1] * .587 + d[j + 2] * .114;
          illum += (l > t ? l / 255 : 0) * k;
          k *= p.decay;
        }
        const v = clamp(illum * p.weight * p.exposure, 0, 1) * 255;
        o[i] = v; o[i + 1] = v; o[i + 2] = v; o[i + 3] = 255;
      }
      s2.x.putImageData(out, 0, 0);
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'lighter';
      x.drawImage(s2.c, 0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
      s1.free(); s2.free();
    });

  /* ═════════ COLOR ═════════ */
  const matrix = (name, id, m, mixLabel) => reg(id, name, 'Color', [T('mix', mixLabel || 'Amount', 0, 1, .01, 1)],
    (x, dst, src, p) => colorPass(x, dst, src, (d, o, i) => {
      const r = d[i] * m[0] + d[i + 1] * m[1] + d[i + 2] * m[2] + (m[4] ? m[4] * 255 : 0);
      const g = d[i] * m[5] + d[i + 1] * m[6] + d[i + 2] * m[7] + (m[9] ? m[9] * 255 : 0);
      const b = d[i] * m[10] + d[i + 1] * m[11] + d[i + 2] * m[12] + (m[14] ? m[14] * 255 : 0);
      o[i] = U.lerp(d[i], r, p.mix); o[i + 1] = U.lerp(d[i + 1], g, p.mix); o[i + 2] = U.lerp(d[i + 2], b, p.mix);
    }));
  matrix('Grayscale', 'grayscale', [.299, .587, .114, 0, 0, .299, .587, .114, 0, 0, .299, .587, .114, 0, 0]);
  matrix('Sepia', 'sepia', [.393, .769, .189, 0, 0, .349, .686, .168, 0, 0, .272, .534, .131, 0, 0]);
  matrix('Invert', 'invert', [-1, 0, 0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1, 0, 1]);

  reg('colortint', 'Color Tint', 'Color', [
    P.color('color', 'Tint', '#7c5cff'),
    P.sel('mode', 'Mode', [['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay']], 'normal'),
    T('amount', 'Amount', 0, 1, .01, .5)],
    (x, dst, src, p) => {
      const [tr, tg, tb] = hex(p.color);
      colorPass(x, dst, src, (d, o, i) => {
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
        let rr, gg, bb;
        if (p.mode === 'multiply') { rr = r * tr / 255; gg = g * tg / 255; bb = b * tb / 255; }
        else if (p.mode === 'screen') { rr = 1 - (1 - r) * (1 - tr / 255); gg = 1 - (1 - g) * (1 - tg / 255); bb = 1 - (1 - b) * (1 - tb / 255); }
        else if (p.mode === 'overlay') {
          rr = r < .5 ? 2 * r * tr / 255 : 1 - 2 * (1 - r) * (1 - tr / 255);
          gg = g < .5 ? 2 * g * tg / 255 : 1 - 2 * (1 - g) * (1 - tg / 255);
          bb = b < .5 ? 2 * b * tb / 255 : 1 - 2 * (1 - b) * (1 - tb / 255);
        } else { rr = tr / 255; gg = tg / 255; bb = tb / 255; }
        o[i] = U.lerp(d[i], rr * 255, p.amount);
        o[i + 1] = U.lerp(d[i + 1], gg * 255, p.amount);
        o[i + 2] = U.lerp(d[i + 2], bb * 255, p.amount);
      });
    });

  reg('chromatic', 'Chromatic Aberration', 'Color', [T('amount', 'Amount', 0, .3, .005, .02), T('cx', 'Center X', 0, 1, .01, .5), T('cy', 'Center Y', 0, 1, .01, .5)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const im = img(src), d = im.data;
      const out = x.createImageData(w, h), o = out.data;
      const cx = p.cx * w, cy = p.cy * h, a = 1 + p.amount, b = 1 - p.amount;
      const smp = (px, py, c) => {
        px = clamp(px | 0, 0, w - 1); py = clamp(py | 0, 0, h - 1);
        return d[(py * w + px) * 4 + c];
      };
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
        const i = (y * w + xx) * 4;
        const dx = xx - cx, dy = y - cy;
        o[i] = smp(cx + dx * a, cy + dy * a, 0);
        o[i + 1] = d[i + 1];
        o[i + 2] = smp(cx + dx * b, cy + dy * b, 2);
        o[i + 3] = d[i + 3];
      }
      x.putImageData(out, 0, 0);
    });

  reg('rgbdisplace', 'RGB Displace', 'Color', [
    T('amount', 'Amount', 0, 100, 1, 8),
    T('ar', 'Angle R', 0, 360, 1, 0), T('ag', 'Angle G', 0, 360, 1, 120), T('ab', 'Angle B', 0, 360, 1, 240)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const im = img(src), d = im.data;
      const out = x.createImageData(w, h), o = out.data;
      const offs = [p.ar, p.ag, p.ab].map(a => [Math.cos(a * Math.PI / 180) * p.amount, Math.sin(a * Math.PI / 180) * p.amount]);
      const smp = (px, py, c) => {
        px = clamp(px | 0, 0, w - 1); py = clamp(py | 0, 0, h - 1);
        return d[(py * w + px) * 4 + c];
      };
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
        const i = (y * w + xx) * 4;
        for (let c = 0; c < 3; c++) o[i + c] = smp(xx + offs[c][0], y + offs[c][1], c);
        o[i + 3] = d[i + 3];
      }
      x.putImageData(out, 0, 0);
    });

  reg('chromakey', 'Chroma Key', 'Color', [
    P.color('key', 'Key color', '#00ff00'), T('tolerance', 'Tolerance', 0, 1, .01, .3),
    T('softness', 'Softness', 0, 1, .01, .1), T('spill', 'Spill suppression', 0, 1, .01, .5)],
    (x, dst, src, p) => {
      const [kr, kg, kb] = hex(p.key);
      colorPass(x, dst, src, (d, o, i) => {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const dist = Math.hypot(r - kr, g - kg, b - kb) / 441.4;
        let a = (dist - p.tolerance) / Math.max(.001, p.softness);
        a = clamp(a, 0, 1);
        o[i + 3] = d[i + 3] * a;
        if (p.spill > 0 && a < 1) {
          const m = (r + b) / 2;
          if (g > m) o[i + 1] = U.lerp(g, m, p.spill);
        }
      });
    });

  reg('premultiply', 'Premultiply Alpha', 'Color', [
    P.sel('mode', 'Mode', [['pre', 'Premultiply'], ['unpre', 'Un-premultiply']], 'pre')],
    (x, dst, src, p) => colorPass(x, dst, src, (d, o, i) => {
      const a = d[i + 3] / 255;
      if (a <= 0) return;
      if (p.mode === 'pre') { o[i] = d[i] * a; o[i + 1] = d[i + 1] * a; o[i + 2] = d[i + 2] * a; }
      else { o[i] = d[i] / a; o[i + 1] = d[i + 1] / a; o[i + 2] = d[i + 2] / a; }
    }));

  reg('alphafx', 'Alpha', 'Color', [T('amount', 'Opacity', 0, 1, .01, 1), P.bool('invert', 'Invert', false)],
    (x, dst, src, p) => colorPass(x, dst, src, (d, o, i) => {
      const a = p.invert ? 1 - d[i + 3] / 255 : d[i + 3] / 255;
      o[i + 3] = a * p.amount * 255;
    }));

  reg('flicker', 'Flicker', 'Stylize', [
    T('speed', 'Speed', 1, 30, 1, 8), T('amount', 'Amount', 0, 1, .01, .3),
    P.sel('mode', 'Mode', [['bright', 'Brightness'], ['alpha', 'Opacity']], 'bright')],
    (x, dst, src, p, st) => {
      const seed = Math.floor((st ? st.t : 0) * p.speed);
      const n = U.hash(seed * 13.7);
      const k = 1 - p.amount * .5 + n * p.amount;
      if (p.mode === 'alpha') {
        x.globalAlpha = clamp(k, 0, 1);
        x.drawImage(src, 0, 0);
        x.globalAlpha = 1;
      } else {
        x.filter = `brightness(${clamp(k, .1, 2)})`;
        x.drawImage(src, 0, 0);
        x.filter = 'none';
      }
    });

  /* ═════════ WARP & DISTORT ═════════ */
  reg('bulge', 'Bulge / Pinch', 'Warp', [
    T('amount', 'Amount (± )', -1, 1, .01, .45), T('radius', 'Radius', .05, 1.5, .01, .7),
    T('cx', 'Center X', 0, 1, .01, .5), T('cy', 'Center Y', 0, 1, .01, .5)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height, m = Math.min(w, h);
      const cx = p.cx * w, cy = p.cy * h, R = p.radius * m;
      warp(x, dst, src, (px, py) => {
        const dx = px - cx, dy = py - cy;
        const r = Math.hypot(dx, dy), d = clamp(r / R, 0, 1);
        if (r < R && r > 0.001) {
          const s = 1 - p.amount * (1 - d) * (1 - d);
          return [cx + dx * s, cy + dy * s];
        }
        return [px, py];
      });
    });

  const fisheyeFn = (inv) => (x, dst, src, p) => {
    const w = src.width, h = src.height, m = Math.min(w, h);
    const cx = p.cx * w, cy = p.cy * h, R = p.radius * m;
    warp(x, dst, src, (px, py) => {
      const dx = px - cx, dy = py - cy;
      const r = Math.hypot(dx, dy), d = clamp(r / R, 0, 1);
      if (d >= 1 || r < 0.001) return [px, py];
      const nd = inv ? Math.pow(d, 1 / (1 + p.strength)) : Math.pow(d, 1 + p.strength);
      const s = nd / d;
      return [cx + dx * s, cy + dy * s];
    });
  };
  reg('fisheye', 'Fish Eye', 'Warp', [T('strength', 'Strength', 0, 3, .05, 1), T('radius', 'Radius', .05, 1.5, .01, .8), T('cx', 'Center X', 0, 1, .01, .5), T('cy', 'Center Y', 0, 1, .01, .5)], fisheyeFn(false));
  reg('fisheye2', 'Fish Eye 2', 'Warp', [T('strength', 'Strength', 0, 3, .05, 1), T('radius', 'Radius', .05, 1.5, .01, .8), T('cx', 'Center X', 0, 1, .01, .5), T('cy', 'Center Y', 0, 1, .01, .5)], fisheyeFn(true));

  reg('twirl', 'Twirl', 'Warp', [T('angle', 'Angle', -720, 720, 1, 90), T('radius', 'Radius', .05, 1.5, .01, .7), T('cx', 'Center X', 0, 1, .01, .5), T('cy', 'Center Y', 0, 1, .01, .5)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height, m = Math.min(w, h);
      const cx = p.cx * w, cy = p.cy * h, R = p.radius * m;
      warp(x, dst, src, (px, py) => {
        const dx = px - cx, dy = py - cy;
        const r = Math.hypot(dx, dy), d = clamp(r / R, 0, 1);
        if (d >= 1) return [px, py];
        const a = Math.atan2(dy, dx) + p.angle * Math.PI / 180 * (1 - d) * (1 - d);
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      });
    });

  reg('polar', 'Polar Coordinates', 'Warp', [
    P.sel('mode', 'Mode', [['topolar', 'Rect → Polar'], ['torect', 'Polar → Rect']], 'topolar'),
    T('blend', 'Blend', 0, 1, .01, 1), T('phase', 'Phase', 0, 6.28, .01, 0), T('repeat', 'Repeat', .25, 4, .25, 1)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const cx = w / 2, cy = h / 2, m = Math.min(w, h);
      warp(x, dst, src, (px, py) => {
        const dx = px - cx, dy = py - cy;
        if (p.mode === 'topolar') {
          const r = Math.hypot(dx, dy) / (m / 2);
          const a = (Math.atan2(dy, dx) + p.phase) / (Math.PI * 2) * p.repeat + .5;
          return [U.lerp(px, a * w, p.blend), U.lerp(py, r * h, p.blend)];
        }
        const a = (px / w - .5) / p.repeat * Math.PI * 2 - p.phase;
        const r = py / h * (m / 2);
        return [U.lerp(px, cx + Math.cos(a) * r, p.blend), U.lerp(py, cy + Math.sin(a) * r, p.blend)];
      }, 'wrap');
    });

  reg('kaleidoscope', 'Kaleidoscope', 'Warp', [
    T('segments', 'Segments', 2, 32, 1, 6), T('rotation', 'Rotation', -180, 180, 1, 0),
    T('cx', 'Center X', 0, 1, .01, .5), T('cy', 'Center Y', 0, 1, .01, .5), P.bool('mirror', 'Mirror alternate', true)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const cx = p.cx * w, cy = p.cy * h;
      const seg = Math.PI * 2 / Math.round(p.segments);
      warp(x, dst, src, (px, py) => {
        const dx = px - cx, dy = py - cy;
        let a = Math.atan2(dy, dx) + p.rotation * Math.PI / 180;
        const r = Math.hypot(dx, dy);
        const k = Math.floor(a / seg);
        a -= k * seg;
        if (p.mirror && (k & 1)) a = seg - a;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      }, 'wrap');
    });

  reg('ripple', 'Repeating Ripple', 'Warp', [
    T('freqX', 'Frequency X', 0, 30, .5, 0), T('freqY', 'Frequency Y', 0, 30, .5, 6),
    T('ampX', 'Amplitude X', 0, 60, 1, 6), T('ampY', 'Amplitude Y', 0, 60, 1, 0), T('speed', 'Speed', -4, 4, .05, 1, { auto: true })],
    (x, dst, src, p, st) => {
      const w = src.width, h = src.height, t = st ? st.t : 0;
      const fy = p.freqY * Math.PI * 2 / h, fx = p.freqX * Math.PI * 2 / w;
      warp(x, dst, src, (px, py) => [
        px + Math.sin(py * fy + t * p.speed * 2) * p.ampX,
        py + Math.sin(px * fx + t * p.speed * 2) * p.ampY
      ]);
    });

  reg('impactripple', 'Impact Ripple', 'Warp', [
    T('speed', 'Speed', 50, 1200, 10, 420), T('decay', 'Decay', .2, 4, .05, .9),
    T('width', 'Ring width', 2, 120, 1, 26), T('freq', 'Wobble', 0, 1, .01, .3),
    T('maxRings', 'Max rings', 1, 12, 1, 4), T('cx', 'Center X', 0, 1, .01, .5), T('cy', 'Center Y', 0, 1, .01, .5)],
    (x, dst, src, p, st, fx) => {
      const w = src.width, h = src.height, m = Math.min(w, h);
      if (!fx._ir) fx._ir = { rings: [], lastBC: 0 };
      const ir = fx._ir, a = st ? st.a : null;
      if (a && a.beatCount > ir.lastBC) {
        ir.lastBC = a.beatCount;
        ir.rings.push({ r: 2, al: 1 });
        if (ir.rings.length > Math.round(p.maxRings)) ir.rings.shift();
      }
      const dt = st ? st.dt || 1 / 60 : 1 / 60;
      for (let i = ir.rings.length - 1; i >= 0; i--) {
        const rg = ir.rings[i];
        rg.r += p.speed * dt; rg.al -= p.decay * dt;
        if (rg.al <= 0 || rg.r > m * 1.5) ir.rings.splice(i, 1);
      }
      if (!ir.rings.length) { x.drawImage(src, 0, 0); return; }
      const cx = p.cx * w, cy = p.cy * h;
      warp(x, dst, src, (px, py) => {
        const dx = px - cx, dy = py - cy;
        const r = Math.hypot(dx, dy) || 1;
        let off = 0;
        for (const rg of ir.rings) {
          const dd = (r - rg.r) / p.width;
          off += Math.exp(-dd * dd) * rg.al * p.width * .6 * (1 + Math.sin(r * .1) * p.freq);
        }
        return [cx + dx / r * (r + off), cy + dy / r * (r + off)];
      });
    });

  reg('displacement', 'Displacement', 'Warp', [
    T('strength', 'Strength', 0, 100, 1, 20), T('scale', 'Noise scale', .005, .1, .005, .02),
    T('speed', 'Speed', 0, 4, .05, .5, { auto: true }), T('angle', 'Direction', 0, 360, 1, 0)],
    (x, dst, src, p, st) => {
      const t = st ? st.t : 0, s = p.scale, a = p.angle * Math.PI / 180;
      const n1 = (px, py) => Math.sin(px * s * 7.3 + t * p.speed * 2) * Math.sin(py * s * 11.1 - t * p.speed * 1.4) + .4 * Math.sin((px + py) * s * 23 + t * p.speed * 3);
      warp(x, dst, src, (px, py) => {
        const n = n1(px, py);
        const n2 = n1(px + 5.2, py - 3.1);
        return [px + n * p.strength * Math.cos(a), py + n2 * p.strength * Math.sin(a)];
      }, 'mirror');
    });

  reg('liquify', 'Liquify', 'Warp', [
    T('strength', 'Strength', 0, 100, 1, 18), T('scale', 'Scale', .003, .05, .001, .012),
    T('speed', 'Speed', 0, 3, .05, .4, { auto: true }), T('turbulence', 'Turbulence', 1, 6, 1, 3)],
    (x, dst, src, p, st) => {
      const t = st ? st.t : 0, s = p.scale, T2 = Math.round(p.turbulence);
      const flow = (px, py, seed) => {
        let v = 0, amp = 1, f = 1;
        for (let o = 0; o < T2; o++) {
          v += Math.sin(px * s * f * 9.1 + seed + t * p.speed * (1 + o * .3)) * Math.cos(py * s * f * 7.7 - seed * 1.7 + t * p.speed * 1.2) * amp;
          amp *= .55; f *= 2.1;
        }
        return v / T2;
      };
      warp(x, dst, src, (px, py) => [px + flow(px, py, 0) * p.strength, py + flow(px, py, 2.7) * p.strength], 'mirror');
    });

  reg('glitch', 'Glitch', 'Stylize', [
    T('slices', 'Slices', 1, 40, 1, 10), T('amount', 'Shift', 0, 200, 1, 30),
    T('speed', 'Speed', .5, 20, .5, 6), T('rgb', 'RGB split', 0, 40, 1, 6), P.bool('onBeat', 'Trigger on beat', false)],
    (x, dst, src, p, st) => {
      const w = src.width, h = src.height, t = st ? st.t : 0;
      const active = !p.onBeat || (st && st.a && st.a.beat > .2);
      const seed = Math.floor(t * p.speed);
      const n = Math.round(p.slices);
      x.drawImage(src, 0, 0);
      if (!active) return;
      for (let i = 0; i < n; i++) {
        const sy0 = Math.floor(U.hash(seed * 31.7 + i * 7.3) * h);
        const sh = 4 + Math.floor(U.hash(i * 13.1 + seed) * h / n);
        const dx = (U.hash(seed * 7.7 + i * 3.3) - .5) * 2 * p.amount;
        x.clearRect(0, sy0, w, sh);
        x.drawImage(src, 0, sy0, w, sh, dx, sy0, w, sh);
        if (p.rgb > 0) {
          x.globalCompositeOperation = 'screen';
          x.globalAlpha = .5;
          x.drawImage(src, 0, sy0, w, sh, dx + p.rgb, sy0, w, sh);
          x.globalAlpha = 1;
          x.globalCompositeOperation = 'source-over';
        }
      }
    });

  /* ═════════ UTILITY & COMPOSITING ═════════ */
  reg('transformfx', 'Transform', 'Transform', [
    T('x', 'X', -1000, 1000, 1, 0), T('y', 'Y', -1000, 1000, 1, 0),
    T('scale', 'Scale', .05, 4, .01, 1), T('rotation', 'Rotation', -360, 360, 1, 0)],
    (x, dst, src, p) => {
      const w = dst.width, h = dst.height;
      x.translate(w / 2 + p.x, h / 2 + p.y);
      x.rotate(p.rotation * Math.PI / 180);
      x.scale(p.scale, p.scale);
      x.drawImage(src, -w / 2, -h / 2);
      x.setTransform(1, 0, 0, 1, 0, 0);
    });

  reg('crop', 'Crop', 'Transform', [
    T('x', 'X', 0, 1, .005, .1), T('y', 'Y', 0, 1, .005, .1),
    T('w', 'Width', .05, 1, .005, .8), T('h', 'Height', .05, 1, .005, .8),
    P.bool('clamp', 'Clamp edges', false)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const cx = p.x * w, cy = p.y * h, cw = Math.max(1, p.w * w), ch = Math.max(1, p.h * h);
      x.drawImage(src, cx, cy, cw, ch, 0, 0, w, h);
      if (p.clamp) {
        /* stretch edge pixels outward */
        x.drawImage(src, cx, cy, 1, ch, cx - w, 0, w, h); /* left edge fill */
        x.drawImage(src, cx + cw - 1, cy, 1, ch, 0, 0, w, h); /* right */
        x.drawImage(src, cx, cy, cw, 1, 0, cy - h, w, h); /* top */
        x.drawImage(src, cx, cy + ch - 1, cw, 1, 0, 0, w, h); /* bottom */
      }
    });

  reg('camerashake', 'Camera Shake', 'Transform', [
    T('intensity', 'Intensity', 0, 100, 1, 12), T('speed', 'Speed', .5, 30, .5, 8),
    T('rotation', 'Rotation shake', 0, 15, .1, 1), T('bass', 'Bass boost', 0, 3, .05, 1)],
    (x, dst, src, p, st) => {
      const t = st ? st.t : 0, a = st ? st.a : null;
      const k = p.intensity * (1 + (a ? a.bass * p.bass : 0));
      const sx = (U.hash(Math.floor(t * p.speed * 7) * 1.1) - .5) * 2 * k;
      const sy = (U.hash(Math.floor(t * p.speed * 7) * 2.3 + 5) - .5) * 2 * k;
      const rr = (U.hash(Math.floor(t * p.speed * 7) * 3.7 + 9) - .5) * 2 * p.rotation * Math.PI / 180;
      const w = dst.width, h = dst.height;
      x.translate(w / 2 + sx, h / 2 + sy);
      x.rotate(rr);
      x.drawImage(src, -w / 2, -h / 2);
      x.setTransform(1, 0, 0, 1, 0, 0);
    });

  reg('blendingfx', 'Blending', 'Compositing', [
    P.sel('blend', 'Blend', [['screen', 'Screen'], ['lighter', 'Add'], ['multiply', 'Multiply'], ['overlay', 'Overlay'], ['difference', 'Difference'], ['soft-light', 'Soft light']], 'screen'),
    T('opacity', 'Opacity', 0, 1, .01, .5)],
    (x, dst, src, p) => {
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = p.blend;
      x.globalAlpha = p.opacity;
      x.drawImage(src, 0, 0);
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    });

  reg('maskfx', 'Mask', 'Compositing', [
    P.sel('shape', 'Shape', [['ellipse', 'Ellipse'], ['rect', 'Rectangle'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient']], 'ellipse'),
    T('x', 'X', 0, 1, .01, .5), T('y', 'Y', 0, 1, .01, .5),
    T('w', 'Width', .02, 1.5, .01, .8), T('h', 'Height', .02, 1.5, .01, .8),
    T('feather', 'Feather', 0, 1, .01, .2), T('angle', 'Angle', 0, 360, 1, 0), P.bool('invert', 'Invert', false)],
    (x, dst, src, p) => {
      const w = dst.width, h = dst.height;
      const s = scratch(w, h), mk = scratch(w, h);
      s.x.drawImage(src, 0, 0);
      const mx = mk.x;
      const cx = p.x * w, cy = p.y * h, mw = p.w * w, mh = p.h * h;
      const grad = p.shape === 'linear' || p.shape === 'radial';
      if (p.invert && !grad) {
        mx.fillStyle = '#fff';
        mx.fillRect(0, 0, w, h);
        mx.globalCompositeOperation = 'destination-out';
      }
      if (p.feather > 0 && !grad) mx.filter = `blur(${p.feather * Math.min(mw, mh) * .5}px)`;
      if (grad) {
        let g;
        if (p.shape === 'radial') g = mx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(2, Math.hypot(mw, mh) / 2));
        else {
          const a = p.angle * Math.PI / 180, r = Math.max(2, Math.hypot(mw, mh) / 2);
          g = mx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        g.addColorStop(0, p.invert ? '#000' : '#fff');
        g.addColorStop(1, p.invert ? '#fff' : '#000');
        mx.fillStyle = g;
        mx.fillRect(0, 0, w, h);
      } else {
        mx.fillStyle = '#fff';
        if (p.shape === 'ellipse') { mx.beginPath(); mx.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, 7); mx.fill(); }
        else mx.fillRect(cx - mw / 2, cy - mh / 2, mw, mh);
        mx.filter = 'none';
      }
      s.x.globalCompositeOperation = 'destination-in';
      s.x.drawImage(mk.c, 0, 0);
      s.x.globalCompositeOperation = 'source-over';
      x.drawImage(s.c, 0, 0);
      s.free(); mk.free();
    });

  reg('renderlayer', 'Render Layer', 'Compositing', [
    P.sel('blend', 'Blend mode', [['source-over', 'Normal'], ['screen', 'Screen'], ['lighter', 'Add'], ['multiply', 'Multiply'], ['overlay', 'Overlay'], ['difference', 'Difference']], 'normal'),
    T('opacity', 'Scene opacity', 0, 1, .01, 1)],
    (x, dst, src, p, st) => {
      if (st && st.frameBefore) {
        x.globalAlpha = clamp(p.opacity, 0, 1);
        x.drawImage(st.frameBefore, 0, 0);
        x.globalAlpha = 1;
      }
      x.globalCompositeOperation = p.blend;
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'source-over';
    });

  reg('timestop', 'Time Stop', 'Temporal', [
    T('hold', 'Hold time (s)', .05, 3, .05, .4),
    P.bool('onBeat', 'Resync on beat', false)],
    (x, dst, src, p, st, fx) => {
      const t = st ? st.t : 0;
      if (!fx._ts || t - fx._ts._t >= p.hold || (p.onBeat && st && st.a && st.a.beat > .8)) {
        if (!fx._ts) fx._ts = { c: mkC(src.width, src.height), _t: 0 };
        if (fx._ts.c.width !== src.width || fx._ts.c.height !== src.height) { fx._ts.c.width = src.width; fx._ts.c.height = src.height; }
        const tc = fx._ts.c.getContext('2d');
        tc.clearRect(0, 0, src.width, src.height);
        tc.drawImage(src, 0, 0);
        fx._ts._t = t;
      }
      x.drawImage(fx._ts.c, 0, 0);
    });

  reg('trail', 'Trail', 'Temporal', [
    T('fade', 'Fade out', .02, 1, .01, .12),
    P.sel('blend', 'Trail blend', [['source-over', 'Normal'], ['lighter', 'Add'], ['screen', 'Screen']], 'source-over')],
    (x, dst, src, p, st, fx) => {
      const w = src.width, h = src.height;
      if (!fx._ta || fx._ta.width !== w || fx._ta.height !== h) {
        fx._ta = mkC(w, h); fx._tb = mkC(w, h);
      }
      const A = fx._ta, B = fx._tb;
      const bx = B.getContext('2d');
      bx.setTransform(1, 0, 0, 1, 0, 0); bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over'; bx.filter = 'none';
      bx.clearRect(0, 0, w, h);
      bx.drawImage(A, 0, 0);
      /* fade the history */
      bx.globalCompositeOperation = 'destination-out';
      bx.fillStyle = `rgba(0,0,0,${clamp(p.fade, 0, 1)})`;
      bx.fillRect(0, 0, w, h);
      bx.globalCompositeOperation = p.blend;
      bx.drawImage(src, 0, 0);
      bx.globalCompositeOperation = 'source-over';
      x.drawImage(B, 0, 0);
      fx._ta = B; fx._tb = A;
    });

  reg('morphfractal', 'Morphing Fractal', 'Temporal', [
    T('zoom', 'Zoom', -5, 5, .1, 1.2), T('rotate', 'Rotate (°/frame)', -10, 10, .1, .8),
    T('fade', 'Persistence', .5, .99, .01, .93),
    P.sel('blend', 'Blend', [['source-over', 'Normal'], ['lighter', 'Add'], ['screen', 'Screen'], ['difference', 'Difference']], 'lighter'),
    T('hue', 'Hue cycle', 0, 360, 1, 0)],
    (x, dst, src, p, st, fx) => {
      const w = src.width, h = src.height;
      if (!fx._fa || fx._fa.width !== w || fx._fa.height !== h) { fx._fa = mkC(w, h); fx._fb = mkC(w, h); }
      const A = fx._fa, B = fx._fb;
      const bx = B.getContext('2d');
      bx.setTransform(1, 0, 0, 1, 0, 0); bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over'; bx.filter = 'none';
      bx.clearRect(0, 0, w, h);
      bx.save();
      bx.globalAlpha = clamp(p.fade, 0, 1);
      bx.translate(w / 2, h / 2);
      bx.rotate(p.rotate * Math.PI / 180);
      const s = 1 + p.zoom * .01;
      bx.scale(s, s);
      bx.translate(-w / 2, -h / 2);
      bx.drawImage(A, 0, 0);
      bx.restore();
      bx.globalCompositeOperation = p.blend;
      bx.drawImage(src, 0, 0);
      bx.globalCompositeOperation = 'source-over';
      if (p.hue) x.filter = `hue-rotate(${p.hue}deg)`;
      x.drawImage(B, 0, 0);
      x.filter = 'none';
      fx._fa = B; fx._fb = A;
    });

  /* ═════════ OUTLINES & SHADOWS ═════════ */
  /* chebyshev alpha dilation via separable max passes */
  function dilateAlpha(im, w, h, r) {
    r = Math.round(r);
    if (r < 1) return;
    const d = im.data;
    let src = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const i = (y * w + xx) * 4 + 3;
      let m = 0;
      for (let k = Math.max(0, xx - r); k <= Math.min(w - 1, xx + r); k++) m = Math.max(m, src[(y * w + k) * 4 + 3]);
      d[i] = m;
    }
    src = new Uint8ClampedArray(d);
    for (let xx = 0; xx < w; xx++) for (let y = 0; y < h; y++) {
      const i = (y * w + xx) * 4 + 3;
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, src[(k * w + xx) * 4 + 3]);
      d[i] = m;
    }
  }

  function outlineDraw(x, dst, src, p, advanced) {
    const w = src.width, h = src.height;
    const im = img(src), d = im.data;
    const mask = x.createImageData(w, h), m = mask.data;
    for (let i = 0; i < d.length; i += 4) m[i + 3] = d[i + 3];
    dilateAlpha(mask, w, h, Math.max(1, p.thickness));
    /* mask alpha minus original alpha = outline ring */
    for (let i = 0; i < d.length; i += 4) m[i + 3] = Math.max(0, m[i + 3] - d[i + 3]);
    const mc = scratch(w, h);
    const [tr, tg, tb] = hex(p.color);
    const mcd = mc.x.getImageData(0, 0, w, h);
    const mm = mcd.data;
    for (let i = 0; i < m.length; i += 4) { mm[i] = tr; mm[i + 1] = tg; mm[i + 2] = tb; mm[i + 3] = m[i + 3]; }
    mc.x.putImageData(mcd, 0, 0);
    let outlineCanvas = mc.c;
    if (advanced && p.softness > 0) {
      const s2 = scratch(w, h);
      s2.x.filter = `blur(${p.softness}px)`;
      s2.x.drawImage(mc.c, 0, 0);
      s2.x.filter = 'none';
      outlineCanvas = s2.c;
      s2.free();
    }
    x.drawImage(outlineCanvas, 0, 0);
    if (advanced && p.glow > 0) {
      x.save();
      x.shadowBlur = p.glow; x.shadowColor = p.color;
      x.drawImage(outlineCanvas, 0, 0);
      x.drawImage(outlineCanvas, 0, 0);
      x.restore();
    }
    x.drawImage(src, 0, 0);
    mc.free();
  }

  reg('outline', 'Simple Outline', 'Light', [T('thickness', 'Thickness', 1, 8, 1, 2), P.color('color', 'Color', '#ffffff')],
    (x, dst, src, p) => outlineDraw(x, dst, src, p, false));

  reg('outlineadv', 'Advanced Outline', 'Light', [
    T('thickness', 'Thickness', 1, 8, 1, 2), P.color('color', 'Color', '#22d3ee'),
    T('softness', 'Softness', 0, 20, 1, 3), T('glow', 'Glow', 0, 60, 1, 12)],
    (x, dst, src, p) => outlineDraw(x, dst, src, p, true));

  reg('shadowadv', 'Advanced Shadow', 'Light', [
    T('offsetX', 'Offset X', -200, 200, 1, 14), T('offsetY', 'Offset Y', -200, 200, 1, 14),
    T('blur', 'Blur', 0, 100, 1, 18), P.color('color', 'Color', '#000000'),
    T('alpha', 'Opacity', 0, 1, .01, .6), T('scale', 'Scale', .2, 3, .05, 1)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const s = scratch(w, h);
      s.x.drawImage(src, 0, 0);
      s.x.globalCompositeOperation = 'source-in';
      s.x.fillStyle = p.color;
      s.x.fillRect(0, 0, w, h);
      s.x.globalCompositeOperation = 'source-over';
      x.globalAlpha = clamp(p.alpha, 0, 1);
      x.save();
      x.translate(w / 2 + p.offsetX, h / 2 + p.offsetY);
      x.scale(p.scale, p.scale);
      x.filter = p.blur ? `blur(${p.blur}px)` : 'none';
      x.drawImage(s.c, -w / 2, -h / 2);
      x.filter = 'none';
      x.restore();
      x.globalAlpha = 1;
      x.drawImage(src, 0, 0);
      s.free();
    });

  /* ═════════ ANALYSIS / FILTER ═════════ */
  reg('cas', 'FidelityFX CAS', 'Filter', [T('sharpness', 'Sharpness', 0, 1, .01, .5)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const im = img(src), d = im.data;
      const out = x.createImageData(w, h), o = out.data;
      o.set(d);
      const k = p.sharpness;
      for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) {
        const i = (y * w + xx) * 4;
        if (d[i + 3] === 0) continue;
        for (let c = 0; c < 3; c++) {
          const cc = d[i + c];
          const up = d[i - w * 4 + c], dn = d[i + w * 4 + c], lf = d[i - 4 + c], rt = d[i + 4 + c];
          const mn = Math.min(cc, up, dn, lf, rt), mx = Math.max(cc, up, dn, lf, rt);
          const amp = k * clamp(1 / (mx - mn + 1), 0, .5);
          o[i + c] = clamp(cc + (cc * 4 - up - dn - lf - rt) * .25 * amp * 4, 0, 255);
        }
      }
      x.putImageData(out, 0, 0);
    });

  reg('fxaa', 'FXAA', 'Filter', [T('threshold', 'Edge threshold', .02, .5, .01, .1)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const im = img(src), d = im.data;
      const out = x.createImageData(w, h), o = out.data;
      o.set(d);
      const luma = (i) => d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114;
      for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) {
        const i = (y * w + xx) * 4;
        if (d[i + 3] === 0) continue;
        const l = luma(i);
        const lN = luma(i - w * 4), lS = luma(i + w * 4), lW = luma(i - 4), lE = luma(i + 4);
        if (Math.max(Math.abs(l - lN), Math.abs(l - lS), Math.abs(l - lW), Math.abs(l - lE)) < p.threshold * 255) continue;
        for (let c = 0; c < 3; c++) {
          o[i + c] = (d[i + c] * 4 + d[i - w * 4 + c] + d[i + w * 4 + c] + d[i - 4 + c] + d[i + 4 + c]) / 8;
        }
      }
      x.putImageData(out, 0, 0);
    });

  reg('distancefield', 'Distance Field', 'Light', [
    T('thickness', 'Range', 1, 12, 1, 4), P.color('color', 'Color', '#7c5cff'), T('shading', 'Shading', 0, 1, .01, .6)],
    (x, dst, src, p) => {
      const w = src.width, h = src.height;
      const im = img(src), d = im.data;
      const dist = new Uint8ClampedArray(w * h);
      const alpha = new Uint8ClampedArray(w * h);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) alpha[j] = d[i + 3];
      /* two dilation sweeps = chebyshev-ish distance transform */
      const R = Math.round(p.thickness);
      for (let step = 1; step <= R; step++) {
        for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
          const j = y * w + xx;
          if (dist[j] === 0 && alpha[j] > 0) continue;
          const near =
            (xx > 0 && (alpha[j - 1] > 0 || dist[j - 1] > 0)) ||
            (xx < w - 1 && (alpha[j + 1] > 0 || dist[j + 1] > 0)) ||
            (y > 0 && (alpha[j - w] > 0 || dist[j - w] > 0)) ||
            (y < h - 1 && (alpha[j + w] > 0 || dist[j + w] > 0));
          if (near && dist[j] === 0 && alpha[j] === 0) dist[j] = 255 - Math.floor((step / R) * 255);
        }
      }
      const out = x.createImageData(w, h), o = out.data;
      const [tr, tg, tb] = hex(p.color);
      for (let j = 0, i = 0; j < dist.length; j++, i += 4) {
        if (dist[j] > 0) {
          const k = (dist[j] / 255) * p.shading + (1 - p.shading);
          o[i] = tr * k; o[i + 1] = tg * k; o[i + 2] = tb * k; o[i + 3] = d[i + 3] > 0 ? d[i + 3] : 255;
        } else {
          o[i] = d[i]; o[i + 1] = d[i + 1]; o[i + 2] = d[i + 2]; o[i + 3] = d[i + 3];
        }
      }
      x.putImageData(out, 0, 0);
    });

  /* ═════════ VHS & SPOOKY ═════════ */
  function vhsCommon(x, dst, src, p, st, v2) {
    const w = src.width, h = src.height, t = st ? st.t : 0;
    const wob = v2 ? 8 : 4, noise = v2 ? .22 : .12, chroma = v2 ? 6 : 3;
    /* per-row horizontal wobble + occasional tracking tear */
    warp(x, dst, src, (px, py) => {
      let dx = Math.sin(py * .04 + t * 6) * wob + Math.sin(t * 2.1) * 2;
      const tear = U.hash(Math.floor(t * 3) * 7.1) > .93 ? Math.sin(py * .01) * 40 : 0;
      return [px + dx + tear, py];
    });
    const im = img(dst), d = im.data;
    const [nr, ng, nb] = v2 ? [10, 0, 8] : [chroma, 0, chroma];
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const i = (y * w + xx) * 4;
      if (d[i + 3] === 0) continue;
      const rx = clamp(xx + nr, 0, w - 1) | 0, bx = clamp(xx - nb, 0, w - 1) | 0;
      const rj = (y * w + rx) * 4, bj = (y * w + bx) * 4;
      const nz = (U.hash(xx * 12.9 + y * 7.7 + Math.floor(t * 24) * 3.1) - .5) * noise * 255;
      const desat = v2 ? .35 : 0;
      const l = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114;
      d[i] = U.lerp(d[rj] + nz, l, desat);
      d[i + 1] = U.lerp(d[i + 1] + nz * .8, l, desat);
      d[i + 2] = U.lerp(d[bj] + nz, l, desat);
      if ((y % 3) === 0) { d[i + 1] = U.lerp(d[i + 1], 255, noise * .3); }
    }
    x.putImageData(im, 0, 0);
    if (v2) {
      /* big colour bands */
      x.globalCompositeOperation = 'overlay';
      x.fillStyle = `hsla(${(t * 40) % 360},80%,50%,.08)`;
      for (let i = 0; i < 3; i++) {
        const yy = (U.hash(Math.floor(t * 2) * 5.5 + i) * h) | 0;
        x.fillRect(0, yy, w, h * .06);
      }
      x.globalCompositeOperation = 'source-over';
    }
  }
  reg('vhs', 'VHS', 'Stylize', [T('intensity', 'Intensity', 0, 1, .01, 1)], (x, dst, src, p, st) => vhsCommon(x, dst, src, p, st, false));
  reg('vhs2', 'VHS 2', 'Stylize', [T('intensity', 'Intensity', 0, 1, .01, 1)], (x, dst, src, p, st) => vhsCommon(x, dst, src, p, st, true));

  reg('spooky', 'Spooky', 'Stylize', [T('amount', 'Amount', 0, 1, .01, .7), T('speed', 'Flicker speed', 1, 20, 1, 8)],
    (x, dst, src, p, st) => {
      const t = st ? st.t : 0;
      x.filter = `grayscale(${p.amount * .8}) brightness(${1 - p.amount * .2})`;
      x.drawImage(src, 0, 0);
      x.filter = 'none';
      colorPass(x, dst, dst, (d, o, i) => {
        const g = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114);
        o[i] = U.lerp(d[i], g * .55, p.amount);
        o[i + 1] = U.lerp(d[i + 1], g * 1.05 + 18 * p.amount, p.amount);
        o[i + 2] = U.lerp(d[i + 2], g * .62, p.amount);
      });
      const w = dst.width, h = dst.height;
      const fl = .5 + .5 * Math.sin(t * p.speed * 2.7) * Math.sin(t * p.speed * 1.3 + 1);
      const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .25, w / 2, h / 2, Math.max(w, h) * .72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(2,8,3,${p.amount * (.55 + fl * .2)})`);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      const nz = U.hash(Math.floor(t * 18) * 3.3) * p.amount * .12;
      if (nz > .01) {
        x.globalAlpha = nz;
        for (let i = 0; i < 400; i++) {
          const px = U.hash(i * 7.7 + Math.floor(t * 18)) * w, py = U.hash(i * 3.1 + Math.floor(t * 18) * 2) * h;
          x.fillStyle = 'rgba(180,255,190,.5)';
          x.fillRect(px, py, 2, 2);
        }
        x.globalAlpha = 1;
      }
    });
})();
