/* Vlexyna — layers.js — layer type registry + visual layers */
'use strict';
(() => {
  const P = VX.P;
  const L = VX.layers = { list: [], byId: {}, order: [] };
  L.register = (def) => { L.list.push(def); L.byId[def.id] = def; return def; };
  L.make = (type) => {
    const def = L.byId[type]; if (!def) return null;
    let n = 1; const proj = VX.project && VX.project.current;
    if (proj) n = proj.layers.filter(l => l.type === type).length + 1;
    return {
      id: U.uid(), type, name: `${def.name} ${n}`, visible: true, locked: false, collapsed: false,
      x: .5, y: .5, scale: 1, rotation: 0, opacity: 1, blend: 'source-over', mirror: 'none',
      start: 0, end: null, auto: {}, fx: [], props: def.defaults(), _seed: Math.random()
    };
  };

  const FONT_STACK = "'Inter', 'Segoe UI', system-ui, sans-serif";
  L.fmtFont = (p, px) => `${p.italic ? 'italic ' : ''}${p.weight} ${px}px ${p.font || FONT_STACK}`;
  L.fonts = [['', 'Default Sans'], ['Arial, Helvetica, sans-serif', 'Arial'], ['Helvetica, Arial, sans-serif', 'Helvetica'], ['Georgia, serif', 'Georgia'], ["'Times New Roman', Times, serif", 'Times'], ["'Courier New', monospace", 'Courier'], ['Impact, Charcoal, sans-serif', 'Impact'], ["'Arial Black', Gadget, sans-serif', 'Arial Black"], ['Verdana, Geneva, sans-serif', 'Verdana'], ["'Trebuchet MS', sans-serif", 'Trebuchet'], ["'Comic Sans MS', cursive", 'Comic Sans'], ['Palatino, \'Palatino Linotype\', serif', 'Palatino']];

  const lg = (x, w, c1, c2) => { const g = x.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; };

  /* ============ BACKGROUND ============ */
  L.register({
    id: 'background', name: 'Background', cat: 'Background', icon: 'image', noTransform: true,
    desc: 'Solid, gradient or image backdrop',
    defaults: () => ({ mode: 'gradient', color: '#07080d', c1: '#0b0d1a', c2: '#1a1030', angle: 90, vign: 0, assetId: '' }),
    params: [
      P.sel('mode', 'Mode', [['color', 'Solid color'], ['gradient', 'Gradient'], ['image', 'Image']], 'gradient'),
      P.color('color', 'Color', '#07080d'),
      P.color('c1', 'Gradient top', '#0b0d1a'), P.color('c2', 'Gradient bottom', '#1a1030'),
      P.num('angle', 'Gradient angle', 0, 360, 1, 90),
      P.file('assetId', 'Image file', 'image/*'),
      P.num('vign', 'Darken edges', 0, 1, .01, 0),
    ],
    draw(x, st) {
      const { W, H, p } = st;
      if (p.mode === 'image' && p.assetId && VX.assets.get(p.assetId)) {
        VX.assets.drawImageCover(x, VX.assets.get(p.assetId).el, 0, 0, W, H);
      } else if (p.mode === 'gradient') {
        const a = p.angle * Math.PI / 180, r = Math.max(W, H);
        const g = x.createLinearGradient(W / 2 - Math.cos(a) * r / 2, H / 2 - Math.sin(a) * r / 2, W / 2 + Math.cos(a) * r / 2, H / 2 + Math.sin(a) * r / 2);
        g.addColorStop(0, p.c1); g.addColorStop(1, p.c2);
        x.fillStyle = g; x.fillRect(0, 0, W, H);
      } else { x.fillStyle = p.color; x.fillRect(0, 0, W, H); }
      if (p.vign > 0) {
        const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${p.vign})`);
        x.fillStyle = g; x.fillRect(0, 0, W, H);
      }
    }
  });

  /* ============ PLASMA ============ */
  L.register({
    id: 'plasma', name: 'Aurora / Plasma', cat: 'Background', icon: 'spark', noTransform: true,
    desc: 'Animated flowing color field',
    defaults: () => ({ c1: '#3b1d6e', c2: '#0ea5a3', c3: '#f43f7a', style: 'plasma', scale: 3, speed: .6, mix: 1, react: .5 }),
    params: [
      P.sel('style', 'Style', [['plasma', 'Plasma'], ['aurora', 'Aurora'], ['sweep', 'Sweep']], 'plasma'),
      P.color('c1', 'Color A'), P.color('c2', 'Color B'), P.color('c3', 'Color C'),
      P.num('scale', 'Scale', .5, 10, .1, 3), P.num('speed', 'Speed', 0, 4, .05, .6, { auto: true }), P.num('react', 'Audio reactivity', 0, 2, .05, .5),
      P.num('mix', 'Opacity mix', 0, 1, .01, 1),
    ],
    draw(x, st) {
      const { W, H, p, t, layer, a } = st;
      const rw = 96, rh = Math.max(24, Math.round(96 * H / W));
      if (!layer._pc) layer._pc = { c: document.createElement('canvas'), w: 0 };
      const pc = layer._pc;
      if (pc.w !== rw) { pc.c.width = rw; pc.c.height = rh; pc.w = rw; }
      const px = pc.c.getContext('2d'), im = px.createImageData(rw, rh), d = im.data;
      const s = p.scale, tt = t * p.speed * (1 + a.bass * p.react * 2);
      const A = U.hex2rgb(p.c1), B = U.hex2rgb(p.c2), C = U.hex2rgb(p.c3);
      const col = (v) => {
        v = U.clamp(v * .5 + .5, 0, 1); let r, g, b;
        if (v < .5) { const u = v * 2; r = U.lerp(A[0], B[0], u); g = U.lerp(A[1], B[1], u); b = U.lerp(A[2], B[2], u); }
        else { const u = v * 2 - 1; r = U.lerp(B[0], C[0], u); g = U.lerp(B[1], C[1], u); b = U.lerp(B[2], C[2], u); }
        return [r, g, b];
      };
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
        const u = i / rw * s, v = j / rh * s;
        let val;
        if (p.style === 'aurora') val = Math.sin(u * 2 + tt) * .5 + Math.sin(v * 3 - tt * 1.3) * .3 + Math.sin((u + v) * 2 + tt * .7) * .2;
        else if (p.style === 'sweep') val = Math.sin(u * 3 + tt * 2) * .6 + Math.sin(v * 1.5 - tt) * .4;
        else val = Math.sin(u * 3 + tt) + Math.sin(v * 3 - tt * 1.2) + Math.sin((u + v) * 2) * .7 + Math.sin(Math.hypot(u - s / 2, v - s / 2) * 4 - tt * 1.5);
        const [r, g, b] = col(val / 2.7);
        const k = (j * rw + i) * 4;
        d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
      }
      px.putImageData(im, 0, 0);
      x.globalAlpha = p.mix;
      x.imageSmoothingEnabled = true;
      x.drawImage(pc.c, 0, 0, W, H);
    }
  });

  /* ============ SPECTRUM ============ */
  L.register({
    id: 'spectrum', name: 'Spectrum', cat: 'Visuals', icon: 'bars',
    desc: 'Audio frequency bars — linear, mirrored, radial, LED, dots',
    defaults: () => ({
      mode: 'bars', count: 64, minFreq: 30, maxFreq: 14000, scaleType: 'log', barWidth: .7, gap: .1,
      height: .38, amplitude: 1, curve: .8, smooth: .5, cap: 0, rounded: true,
      c1: '#22d3ee', c2: '#7c5cff', solid: false, glow: 18, mirror: false,
      radius: .16, spin: 0, rot0: 0, width: .9, thickness: 6, dotSize: .6, pulse: .25, alphaFloor: .35
    }),
    params: [
      P.group('Style', [
        P.sel('mode', 'Mode', [['bars', 'Bars'], ['mirror', 'Mirror bars'], ['radial', 'Radial'], ['dots', 'Dot columns'], ['blocks', 'LED blocks']], 'bars'),
        P.num('count', 'Bar count', 8, 256, 1, 64),
        P.num('barWidth', 'Bar width', .05, 1, .01, .7),
        P.bool('rounded', 'Rounded caps', true),
        P.num('cap', 'LED segment size', 0, 60, 1, 0),
        P.num('glow', 'Glow', 0, 80, 1, 18),
      ]),
      P.group('Range', [
        P.num('minFreq', 'Min frequency (Hz)', 20, 2000, 5, 30),
        P.num('maxFreq', 'Max frequency (Hz)', 1000, 18000, 100, 14000),
        P.sel('scaleType', 'Frequency scale', [['log', 'Logarithmic'], ['linear', 'Linear']], 'log'),
        P.num('curve', 'Tone curve', .3, 1.6, .05, .8),
        P.num('smooth', 'Smoothing', 0, .95, .01, .5),
      ]),
      P.group('Colors', [
        P.bool('solid', 'Single color', false), P.color('c1', 'Color A'), P.color('c2', 'Color B'),
        P.num('alphaFloor', 'Idle brightness', 0, 1, .01, .35),
      ]),
      P.group('Size & motion', [
        P.num('height', 'Height', .02, 1.2, .01, .38, { auto: true }),
        P.num('width', 'Width span', .05, 2, .01, .9),
        P.num('amplitude', 'Amplitude', 0, 3, .05, 1),
        P.num('pulse', 'Bass pulse', 0, 1, .05, .25),
        P.num('radius', 'Radial inner radius', 0, .6, .01, .16),
        P.num('spin', 'Spin speed (°/s)', -180, 180, 1, 0, { auto: true }),
        P.num('rot0', 'Base rotation', -360, 360, 1, 0),
        P.num('thickness', 'Line thickness', 1, 30, 1, 6),
        P.num('dotSize', 'Dot size', .1, 2, .05, .6),
      ]),
      P.group('Presets', [
        P.act('preset_trap', 'Trap Nation', (l) => VX.layers.presetSpectrum(l, 'trap')),
        P.act('preset_slim', 'Slim minimal', (l) => VX.layers.presetSpectrum(l, 'slim')),
        P.act('preset_led', 'LED wall', (l) => VX.layers.presetSpectrum(l, 'led')),
        P.act('preset_radial', 'Radial ring', (l) => VX.layers.presetSpectrum(l, 'radial')),
        P.act('preset_fire', 'Fire', (l) => VX.layers.presetSpectrum(l, 'fire')),
      ]),
    ],
    draw(x, st) {
      const { W, H, p, t, a, layer } = st;
      const n = Math.round(p.count);
      if (!layer._bars || layer._bars.length !== n) { layer._bars = new Float32Array(n); layer._barN = n; }
      const bars = layer._bars;
      const rise = U.clamp(.9 - p.smooth * .85, .06, 1), fall = U.clamp(.4 - p.smooth * .36, .02, 1);
      const f0 = Math.max(20, p.minFreq), f1 = Math.min(18000, p.maxFreq);
      for (let i = 0; i < n; i++) {
        let lo, hi;
        if (p.scaleType === 'log') { lo = f0 * Math.pow(f1 / f0, i / n); hi = f0 * Math.pow(f1 / f0, (i + 1) / n); }
        else { lo = f0 + (f1 - f0) * i / n; hi = f0 + (f1 - f0) * (i + 1) / n; }
        const target = Math.pow(VX.audio.engine.range(lo, hi), p.curve) * p.amplitude * (1 + a.bass * p.pulse);
        bars[i] += (target - bars[i]) * (target > bars[i] ? rise : fall);
      }
      const colAt = (i) => p.solid ? p.c1 : U.lerpColor(p.c1, p.c2, n > 1 ? i / (n - 1) : 0);
      x.save();
      x.lineCap = p.rounded ? 'round' : 'butt';
      if (p.glow > 0) { x.shadowBlur = p.glow * (H / 1080); x.shadowColor = colAt(n / 2); }
      const hMax = p.height * H * (1 + a.bass * p.pulse * .6);

      if (p.mode === 'radial') {
        const rot = (p.rot0 + p.spin * t) * Math.PI / 180;
        const r0 = p.radius * Math.min(W, H);
        const step = Math.PI * 2 / n;
        for (let i = 0; i < n; i++) {
          const ang = rot + i * step - Math.PI / 2;
          const v = bars[i];
          const r1 = r0 + v * hMax;
          x.strokeStyle = colAt(i);
          x.lineWidth = Math.max(1, (Math.PI * 2 * r0 / n) * p.barWidth * .9);
          x.beginPath();
          x.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
          x.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
          x.stroke();
          if (v > .01) {
            x.fillStyle = colAt(i);
            x.beginPath(); x.arc(Math.cos(ang) * (r1 + 7 * (H / 1080)), Math.sin(ang) * (r1 + 7 * (H / 1080)), Math.max(1.5, x.lineWidth * .35), 0, 7); x.fill();
          }
        }
      } else if (p.mode === 'dots' || p.mode === 'blocks') {
        const span = p.width * W, slot = span / n;
        const dotR = Math.max(1, slot * p.barWidth * .5 * (p.mode === 'dots' ? p.dotSize : 1));
        const seg = p.cap > 0 ? p.cap * (H / 1080) : 0;
        for (let i = 0; i < n; i++) {
          const v = bars[i], cx = -span / 2 + slot * (i + .5);
          x.fillStyle = colAt(i);
          if (p.mode === 'dots') {
            const m = Math.max(1, Math.floor(v * hMax / Math.max(2, dotR * 2.4)));
            for (let j = 0; j < m; j++) { x.globalAlpha = (st.alpha ?? 1) * (0.4 + .6 * (j / Math.max(1, m))); x.beginPath(); x.arc(cx, -j * dotR * 2.4 - dotR, dotR, 0, 7); x.fill(); }
          } else {
            const total = v * hMax;
            for (let y = 0; y < total; y += seg) {
              const hh = Math.min(seg * .82, total - y);
              x.fillRect(cx - slot * p.barWidth / 2, -y - hh, slot * p.barWidth, hh);
            }
          }
          x.globalAlpha = st.alpha ?? 1;
        }
      } else {
        const span = p.width * W, slot = span / n;
        const bw = Math.max(1, slot * p.barWidth - slot * p.gap * .5);
        const mirror = p.mode === 'mirror';
        for (let i = 0; i < n; i++) {
          const v = bars[i], cx = -span / 2 + slot * (i + .5);
          const hh = Math.max(2, v * hMax);
          const grad = x.createLinearGradient(0, 0, 0, -hh);
          const c = colAt(i);
          grad.addColorStop(0, U.withAlpha(c, 1)); grad.addColorStop(1, U.withAlpha(U.shade(c, .35), 1));
          x.fillStyle = c;
          if (mirror) {
            x.fillRect(cx - bw / 2, -hh, bw, hh * 2);
            if (p.rounded) {
              x.beginPath(); x.roundRect ? x.roundRect(cx - bw / 2, -hh, bw, hh * 2, bw / 2) : x.rect(cx - bw / 2, -hh, bw, hh * 2); x.fill();
            }
          } else {
            if (p.rounded && bw > 2) {
              x.beginPath(); x.roundRect ? x.roundRect(cx - bw / 2, -hh, bw, hh, Math.min(bw / 2, hh / 2)) : x.rect(cx - bw / 2, -hh, bw, hh); x.fill();
            } else x.fillRect(cx - bw / 2, -hh, bw, hh);
          }
        }
      }
      /* idle base line */
      x.shadowBlur = 0;
      x.restore();
    }
  });
  L.presetSpectrum = (layer, kind) => {
    const set = (o) => Object.assign(layer.props, o);
    if (kind === 'trap') set({ mode: 'bars', count: 96, barWidth: .55, rounded: true, c1: '#22d3ee', c2: '#a855f7', height: .42, glow: 26, minFreq: 30, maxFreq: 12000, curve: .75, alphaFloor: .3 });
    if (kind === 'slim') set({ mode: 'bars', count: 48, barWidth: .18, rounded: true, c1: '#e2e8f0', c2: '#e2e8f0', solid: true, height: .22, glow: 0, curve: .9 });
    if (kind === 'led') set({ mode: 'blocks', count: 40, barWidth: .8, cap: 26, c1: '#22c55e', c2: '#ef4444', height: .5, glow: 8, curve: .8 });
    if (kind === 'radial') set({ mode: 'radial', count: 110, radius: .18, height: .3, c1: '#f472b6', c2: '#22d3ee', glow: 20, barWidth: .6 });
    if (kind === 'fire') set({ mode: 'mirror', count: 72, barWidth: .85, rounded: false, c1: '#fde047', c2: '#dc2626', height: .5, glow: 30, curve: .7 });
    VX.ui && VX.ui.refreshInspector();
  };

  /* ============ AUDIO WAVE ============ */
  L.register({
    id: 'wave', name: 'Audio Wave', cat: 'Visuals', icon: 'wave',
    desc: 'Oscilloscope waveform — line, fill, mirror, circle',
    defaults: () => ({ style: 'line', points: 220, thickness: 6, amplitude: .25, c1: '#22d3ee', c2: '#7c5cff', gradient: true, glow: 20, width: .95, smooth: .35, mirror: false }),
    params: [
      P.sel('style', 'Style', [['line', 'Line'], ['fill', 'Filled'], ['mirror', 'Mirrored'], ['circle', 'Circle'], ['dualcircle', 'Dual circle']], 'line'),
      P.num('points', 'Detail', 16, 1024, 8, 220),
      P.num('thickness', 'Thickness', 1, 40, 1, 6, { auto: true }),
      P.num('amplitude', 'Amplitude', .01, 1.5, .01, .25, { auto: true }),
      P.num('width', 'Width', .05, 2, .01, .95),
      P.bool('gradient', 'Gradient'), P.color('c1', 'Color A'), P.color('c2', 'Color B'),
      P.num('glow', 'Glow', 0, 60, 1, 20),
      P.num('smooth', 'Smoothing', 0, .9, .01, .35),
    ],
    draw(x, st) {
      const { W, H, p, a } = st;
      const wave = a.wave, n = Math.round(p.points);
      const hMax = p.amplitude * H;
      x.save();
      x.lineJoin = x.lineCap = 'round';
      if (p.glow) { x.shadowBlur = p.glow * (H / 1080); x.shadowColor = p.c1; }
      const grad = p.gradient ? lg(x, p.width * W, p.c1, p.c2) : p.c1;
      const sm = p.smooth;
      let prev = 0;
      const sample = (i) => {
        const idx = Math.floor(i / n * wave.length);
        let v = wave[idx] || 0;
        v = v * (1 - sm) + prev * sm; prev = v;
        return v;
      };
      if (p.style === 'circle' || p.style === 'dualcircle') {
        const r = H * .22;
        x.strokeStyle = grad; x.lineWidth = p.thickness * (H / 1080); x.fillStyle = grad;
        for (const dir of (p.style === 'dualcircle' ? [1, -1] : [1])) {
          x.beginPath();
          for (let i = 0; i <= n; i++) {
            const ang = i / n * Math.PI * 2 - Math.PI / 2;
            const v = sample(i % n) * hMax * dir;
            const rr = r + v;
            const px2 = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
            i === 0 ? x.moveTo(px2, py) : x.lineTo(px2, py);
          }
          x.closePath(); x.stroke();
        }
      } else {
        const span = p.width * W;
        x.beginPath();
        for (let i = 0; i <= n; i++) {
          const v = sample(i) * hMax;
          const px2 = -span / 2 + span * i / n;
          i === 0 ? x.moveTo(px2, v) : x.lineTo(px2, v);
        }
        if (p.style === 'fill' || p.style === 'mirror') {
          x.lineTo(span / 2, 0); x.lineTo(-span / 2, 0); x.closePath();
          x.globalAlpha *= .25; x.fill(); x.globalAlpha /= .25;
          x.beginPath();
          for (let i = 0; i <= n; i++) { const v = sample(i) * hMax; const px2 = -span / 2 + span * i / n; i === 0 ? x.moveTo(px2, v) : x.lineTo(px2, v); }
        }
        if (p.style === 'mirror') { x.save(); x.scale(1, -1); }
        x.strokeStyle = grad; x.lineWidth = p.thickness * (H / 1080);
        x.stroke();
        if (p.style === 'mirror') { x.stroke(); x.restore(); }
      }
      x.restore();
    }
  });

  /* ============ PARTICLES ============ */
  L.register({
    id: 'particles', name: 'Particles', cat: 'Visuals', icon: 'particles',
    desc: 'Audio-reactive particle system',
    defaults: () => ({ count: 120, size: 6, sizeVar: .8, c1: '#7c5cff', c2: '#22d3ee', gradient: true, speed: 40, direction: 'up', gravity: 0, twinkle: .5, beatBurst: .5, bassScale: .5, glow: 12, trail: 0 }),
    params: [
      P.num('count', 'Count', 1, 1200, 1, 120),
      P.num('size', 'Size', 1, 40, .5, 6), P.num('sizeVar', 'Size variance', 0, 1, .01, .8),
      P.sel('direction', 'Direction', [['up', 'Up'], ['down', 'Down'], ['out', 'Burst outward'], ['orbit', 'Orbit'], ['random', 'Random']], 'up'),
      P.num('speed', 'Speed', 0, 400, 1, 40), P.num('gravity', 'Gravity', -200, 200, 1, 0),
      P.color('c1', 'Color A'), P.color('c2', 'Color B'), P.bool('gradient', 'Vary colors'),
      P.num('twinkle', 'Twinkle', 0, 1, .01, .5), P.num('beatBurst', 'Beat kick', 0, 2, .05, .5),
      P.num('bassScale', 'Bass size boost', 0, 2, .05, .5), P.num('glow', 'Glow', 0, 40, 1, 12),
    ],
    draw(x, st) {
      const { W, H, p, dt, a, layer } = st;
      const n = Math.round(p.count);
      if (!layer._ps || layer._ps.length !== n) {
        layer._ps = [];
        for (let i = 0; i < n; i++) layer._ps.push({
          x: (U.hash(i * 7.3 + layer._seed * 100) - .5) * W, y: (U.hash(i * 3.1 + 9) - .5) * H,
          vx: (U.hash(i + 40) - .5) * 30, vy: 0, s: .3 + U.hash(i * 13.7) * p.sizeVar,
          tw: U.hash(i * 3.7) * 6.28, hue: U.hash(i * 1.9)
        });
      }
      const ps = layer._ps, kick = a.beat * p.beatBurst * 240;
      x.save();
      if (p.glow) { x.shadowBlur = p.glow * (H / 1080); }
      for (let i = 0; i < ps.length; i++) {
        const pt = ps[i];
        const sc = 1 + a.bass * p.bassScale;
        if (p.direction === 'orbit') {
          const ang = Math.atan2(pt.y, pt.x) + (p.speed / 400) * dt * (1 + a.level * 2);
          const r = Math.hypot(pt.x, pt.y) || 1;
          pt.x = Math.cos(ang) * r; pt.y = Math.sin(ang) * r;
        } else if (p.direction === 'out') {
          const r = Math.hypot(pt.x, pt.y) || 1;
          const v = (p.speed + kick) * dt / r * 60;
          pt.x += pt.x / r * v; pt.y += pt.y / r * v;
          if (Math.abs(pt.x) > W / 2 || Math.abs(pt.y) > H / 2) { pt.x *= .1; pt.y *= .1; }
        } else {
          const dir = p.direction === 'down' ? 1 : -1;
          pt.vy += (p.gravity * 60) * dt;
          pt.y += dir * (p.speed + kick) * dt + pt.vy * dt;
          pt.x += pt.vx * dt * (1 + a.treble * 2);
        }
        if (pt.y < -H / 2 - 20) pt.y = H / 2 + 10; if (pt.y > H / 2 + 20) pt.y = -H / 2 - 10;
        if (pt.x < -W / 2 - 20) pt.x = W / 2 + 10; if (pt.x > W / 2 + 20) pt.x = -W / 2 - 10;
        const tw = p.twinkle ? .5 + .5 * Math.sin(pt.tw + performance.now() / 300 + i) : 1;
        const col = p.gradient ? U.lerpColor(p.c1, p.c2, pt.hue) : p.c1;
        x.fillStyle = col;
        if (p.glow) x.shadowColor = col;
        const sz = p.size * pt.s * sc * (H / 1080) * (0.6 + tw * .4 + a.beat * p.beatBurst * .8);
        x.globalAlpha = (st.alpha ?? 1) * (.35 + .65 * tw);
        x.beginPath(); x.arc(pt.x, pt.y, Math.max(.5, sz), 0, 7); x.fill();
      }
      x.restore();
    }
  });

  /* ============ STARFIELD ============ */
  L.register({
    id: 'starfield', name: 'Starfield / Warp', cat: 'Visuals', icon: 'spark',
    desc: 'Flying-through-stars depth field',
    defaults: () => ({ count: 260, speed: 60, warp: 2, size: 3, c1: '#ffffff', c2: '#8ab4ff', gradient: true, glow: 8, bassSpeed: 1.2 }),
    params: [
      P.num('count', 'Stars', 10, 1500, 5, 260),
      P.num('speed', 'Speed', 0, 600, 1, 60), P.num('warp', 'Warp streaks', 0, 6, .1, 2),
      P.num('size', 'Star size', .5, 12, .5, 3),
      P.color('c1', 'Color A'), P.color('c2', 'Color B'), P.bool('gradient', 'Vary colors'),
      P.num('glow', 'Glow', 0, 40, 1, 8), P.num('bassSpeed', 'Bass boost', 0, 4, .1, 1.2),
    ],
    draw(x, st) {
      const { W, H, p, dt, a, layer } = st;
      const n = Math.round(p.count);
      if (!layer._stars || layer._stars.length !== n) {
        layer._stars = [];
        for (let i = 0; i < n; i++) layer._stars.push({ x: U.hash(i * 7.7 + layer._seed * 50) - .5, y: U.hash(i * 3.3 + 2) - .5, z: U.hash(i * 9.1), h: U.hash(i * 1.3) });
      }
      const v = p.speed * (1 + a.bass * p.bassSpeed) * dt;
      x.save();
      if (p.glow) x.shadowBlur = p.glow * (H / 1080);
      for (const s of layer._stars) {
        s.z -= v; if (s.z <= 0.02) { s.z = 1; s.x = U.hash(Math.random() * 999) - .5; s.y = U.hash(Math.random() * 999 + 5) - .5; }
        const k = 1 / s.z;
        const px2 = s.x * k * W * .8, py = s.y * k * H * .8;
        if (Math.abs(px2) > W / 2 + 10 || Math.abs(py) > H / 2 + 10) continue;
        const col = p.gradient ? U.lerpColor(p.c1, p.c2, s.h) : p.c1;
        const sz = p.size * k * .35 * (H / 1080);
        x.strokeStyle = x.fillStyle = col;
        if (p.glow) x.shadowColor = col;
        if (k > p.warp * 2 && p.warp > 0) {
          const k2 = 1 / (s.z + v * p.warp * 2);
          x.lineWidth = Math.max(.6, sz * .4); x.globalAlpha = (st.alpha ?? 1) * .85;
          x.beginPath(); x.moveTo(px2, py); x.lineTo(s.x * k2 * W * .8, s.y * k2 * H * .8); x.stroke();
        } else {
          x.globalAlpha = (st.alpha ?? 1) * U.clamp(k * .9, .1, 1);
          x.beginPath(); x.arc(px2, py, Math.max(.4, sz), 0, 7); x.fill();
        }
      }
      x.restore();
    }
  });

  /* ============ TUNNEL ============ */
  L.register({
    id: 'tunnel', name: 'Tunnel', cat: 'Visuals', icon: 'circle',
    desc: 'Infinite perspective rings',
    defaults: () => ({ rings: 18, speed: .35, spread: 1.4, thickness: 4, c1: '#7c5cff', c2: '#22d3ee', rotateSpeed: 20, beatZoom: .5, glow: 14, shape: 'circle', sides: 6, twist: 2 }),
    params: [
      P.num('rings', 'Rings', 3, 60, 1, 18), P.num('speed', 'Speed', .05, 3, .01, .35),
      P.num('spread', 'Spread', .2, 4, .05, 1.4), P.num('thickness', 'Thickness', .5, 30, .5, 4),
      P.sel('shape', 'Shape', [['circle', 'Circles'], ['poly', 'Polygons'], ['square', 'Squares']], 'circle'),
      P.num('sides', 'Polygon sides', 3, 12, 1, 6), P.num('twist', 'Twist', 0, 10, .1, 2),
      P.color('c1', 'Near color'), P.color('c2', 'Far color'),
      P.num('rotateSpeed', 'Rotation (°/s)', -180, 180, 1, 20, { auto: true }),
      P.num('beatZoom', 'Beat zoom', 0, 2, .05, .5), P.num('glow', 'Glow', 0, 50, 1, 14),
    ],
    draw(x, st) {
      const { W, H, p, t, dt, a, layer } = st;
      const m = Math.min(W, H);
      if (layer._z === undefined) layer._z = 0;
      layer._z = (layer._z + p.speed * dt * (1 + a.beat * p.beatZoom * 3)) % 1;
      const n = Math.round(p.rings);
      x.save();
      if (p.glow) { x.shadowBlur = p.glow * (H / 1080); x.shadowColor = p.c1; }
      for (let i = n - 1; i >= 0; i--) {
        const z = ((i + layer._z) / n);
        const persp = Math.pow(z, 1.8);
        const r = persp * p.spread * m * .6 * (1 + a.beat * p.beatZoom * .25);
        const alpha = (st.alpha ?? 1) * (1 - z * .85) * (p.glow ? 1 : .95);
        if (r < 2 || alpha <= 0.01) continue;
        x.globalAlpha = alpha;
        x.strokeStyle = U.lerpColor(p.c1, p.c2, z);
        x.lineWidth = Math.max(.5, p.thickness * (H / 1080) * (1 - z * .7));
        const rot = (p.rotateSpeed * t + z * p.twist * 6.28);
        x.save(); x.rotate(rot);
        if (p.shape === 'circle') { x.beginPath(); x.arc(0, 0, r, 0, 7); x.stroke(); }
        else {
          const sides = p.shape === 'square' ? 4 : Math.round(p.sides);
          x.beginPath();
          for (let k = 0; k <= sides; k++) { const ang = k / sides * Math.PI * 2; const px2 = Math.cos(ang) * r, py = Math.sin(ang) * r; k === 0 ? x.moveTo(px2, py) : x.lineTo(px2, py); }
          x.stroke();
        }
        x.restore();
      }
      x.restore();
    }
  });

  /* ============ BEAT RINGS ============ */
  L.register({
    id: 'rings', name: 'Beat Rings', cat: 'Visuals', icon: 'circle',
    desc: 'Ripples that expand on every beat',
    defaults: () => ({ speed: 500, thickness: 5, c1: '#22d3ee', c2: '#7c5cff', decay: 1.2, maxRings: 12, minGap: 0, size0: 30, lineWidth: true, glow: 16, autoSpin: 0 }),
    params: [
      P.num('speed', 'Expand speed', 50, 2000, 10, 500, { auto: true }),
      P.num('thickness', 'Thickness', .5, 30, .5, 5),
      P.num('size0', 'Start size', 0, 400, 1, 30),
      P.num('decay', 'Fade speed', .2, 4, .05, 1.2),
      P.num('maxRings', 'Max rings', 1, 40, 1, 12),
      P.color('c1', 'Color A'), P.color('c2', 'Color B'),
      P.num('glow', 'Glow', 0, 50, 1, 16),
      P.num('autoSpin', 'Rotation (°/s)', -180, 180, 1, 0),
    ],
    draw(x, st) {
      const { H, p, dt, a, layer, t } = st;
      if (!layer._rings) layer._rings = [];
      const rs = layer._rings;
      if (layer._lastBC === undefined) layer._lastBC = a.beatCount;
      if (a.beatCount > layer._lastBC || (!p.minGap && a.level > .4 && rs.length === 0 && t - (layer._lt || -9) > .8)) {
        layer._lastBC = a.beatCount; layer._lt = t;
        rs.push({ r: p.size0 * (H / 1080), a: 1 });
        if (rs.length > p.maxRings) rs.shift();
      }
      x.save();
      if (p.glow) { x.shadowBlur = p.glow * (H / 1080); x.shadowColor = p.c1; }
      x.rotate(p.autoSpin * t * Math.PI / 180);
      for (let i = rs.length - 1; i >= 0; i--) {
        const r = rs[i];
        r.r += p.speed * dt * (H / 1080); r.a -= p.decay * dt;
        if (r.a <= 0) { rs.splice(i, 1); continue; }
        x.globalAlpha = (st.alpha ?? 1) * r.a;
        x.strokeStyle = U.lerpColor(p.c1, p.c2, 1 - r.a);
        x.lineWidth = Math.max(.5, p.thickness * (H / 1080) * r.a);
        x.beginPath(); x.arc(0, 0, r.r, 0, 7); x.stroke();
      }
      x.restore();
    }
  });

  /* ============ ORBS / BOKEH ============ */
  L.register({
    id: 'orbs', name: 'Bokeh Orbs', cat: 'Decor', icon: 'particles',
    desc: 'Soft glowing floating orbs',
    defaults: () => ({ count: 14, minSize: 20, maxSize: 110, c1: '#7c5cff', c2: '#22d3ee', c3: '#f472b6', speed: 12, blur: 30, alpha: .5, bassSwell: .6, twinkle: .3, hueShift: 0 }),
    params: [
      P.num('count', 'Count', 1, 80, 1, 14),
      P.num('minSize', 'Min size', 4, 200, 1, 20), P.num('maxSize', 'Max size', 10, 400, 1, 110),
      P.color('c1', 'Color A'), P.color('c2', 'Color B'), P.color('c3', 'Color C'),
      P.num('speed', 'Drift speed', 0, 100, .5, 12), P.num('blur', 'Softness', 0, 100, 1, 30),
      P.num('alpha', 'Opacity', .05, 1, .01, .5), P.num('bassSwell', 'Bass swell', 0, 2, .05, .6),
      P.num('twinkle', 'Twinkle', 0, 1, .01, .3), P.num('hueShift', 'Hue drift', -20, 20, .5, 0),
    ],
    draw(x, st) {
      const { W, H, p, dt, a, layer, t } = st;
      const n = Math.round(p.count);
      if (!layer._os || layer._os.length !== n) {
        layer._os = [];
        for (let i = 0; i < n; i++) layer._os.push({ x: U.hash(i * 5.1 + layer._seed * 30) * W - W / 2, y: U.hash(i * 8.3 + 4) * H - H / 2, s: .2 + U.hash(i * 2.7) * .8, vx: (U.hash(i * 4.4) - .5) * 20, vy: (U.hash(i * 6.2) - .5) * 20, c: Math.floor(U.hash(i * 1.1) * 3), tw: U.hash(i * 7) * 7 });
      }
      x.save();
      x.globalCompositeOperation = 'lighter';
      const cols = [p.c1, p.c2, p.c3];
      for (const o of layer._os) {
        o.x += o.vx * p.speed / 40 * dt * 60 * .016 + Math.sin(t * .3 + o.tw) * .3;
        o.y += o.vy * p.speed / 40 * dt * 60 * .016 - Math.cos(t * .2 + o.tw) * .2;
        if (o.x < -W / 2 - 200) o.x = W / 2 + 150; if (o.x > W / 2 + 200) o.x = -W / 2 - 150;
        if (o.y < -H / 2 - 200) o.y = H / 2 + 150; if (o.y > H / 2 + 200) o.y = -H / 2 - 150;
        const swell = 1 + a.bass * p.bassSwell * .8;
        const sz = U.lerp(p.minSize, p.maxSize, o.s) * (H / 1080) * swell;
        const tw = p.twinkle ? .7 + .3 * Math.sin(t * 2 + o.tw * 3) : 1;
        let col = cols[o.c];
        if (p.hueShift) { const m = col.match(/hsl\((\d+)/); if (m) col = `hsl(${+m[1] + t * p.hueShift},70%,60%)`; }
        const g = x.createRadialGradient(o.x, o.y, 0, o.x, o.y, sz);
        g.addColorStop(0, U.withAlpha(col, p.alpha * tw));
        g.addColorStop(.65, U.withAlpha(col, p.alpha * tw * .35));
        g.addColorStop(1, U.withAlpha(col, 0));
        x.fillStyle = g;
        x.beginPath(); x.arc(o.x, o.y, sz, 0, 7); x.fill();
      }
      x.restore();
    }
  });

  /* ============ CONFETTI ============ */
  L.register({
    id: 'confetti', name: 'Confetti', cat: 'Decor', icon: 'spark',
    desc: 'Falling celebration confetti',
    defaults: () => ({ count: 90, size: 12, gravity: 260, drag: .1, flutter: 2, spin: 4, c1: '#f43f5e', c2: '#22d3ee', c3: '#fbbf24', c4: '#4ade80', c5: '#7c5cff', beatBurst: .6, shape: 'rect' }),
    params: [
      P.num('count', 'Count', 1, 800, 1, 90), P.num('size', 'Size', 3, 50, 1, 12),
      P.num('gravity', 'Gravity', 20, 900, 5, 260), P.num('drag', 'Air drag', 0, .5, .01, .1),
      P.num('flutter', 'Flutter', 0, 8, .1, 2), P.num('spin', 'Spin', 0, 15, .1, 4),
      P.color('c1', 'Color 1'), P.color('c2', 'Color 2'), P.color('c3', 'Color 3'), P.color('c4', 'Color 4'), P.color('c5', 'Color 5'),
      P.num('beatBurst', 'Beat kick', 0, 3, .05, .6),
      P.sel('shape', 'Shape', [['rect', 'Rectangles'], ['circle', 'Circles'], ['mix', 'Mixed']], 'rect'),
    ],
    draw(x, st) {
      const { W, H, p, dt, a, layer } = st;
      const n = Math.round(p.count);
      if (!layer._cs || layer._cs.length !== n) {
        layer._cs = [];
        for (let i = 0; i < n; i++) layer._cs.push({ x: U.hash(i * 3.3 + layer._seed * 60) * W - W / 2, y: U.hash(i * 7.1) * H - H / 2, vy: 20 + U.hash(i * 2.2) * 60, vx: (U.hash(i * 5.5) - .5) * 60, ph: U.hash(i * 9) * 7, sp: (U.hash(i * 4.1) - .5) * 8, c: Math.floor(U.hash(i * 1.7) * 5) });
      }
      const cols = [p.c1, p.c2, p.c3, p.c4, p.c5];
      const kick = a.beat * p.beatBurst * 400;
      x.save();
      for (const c of layer._cs) {
        c.vy += (p.gravity + kick) * dt;
        c.vy *= (1 - p.drag * dt * 10);
        c.y += c.vy * dt;
        c.x += (c.vx + Math.sin(c.y / 40 + c.ph) * p.flutter * 40) * dt;
        if (c.y > H / 2 + 30) { c.y = -H / 2 - 20; c.vy = 20 + U.hash(Math.random() * 99) * 60; c.x = U.hash(Math.random() * 99) * W - W / 2; }
        const rot = c.ph + c.y * .01 * c.sp * p.spin;
        x.save(); x.translate(c.x, c.y); x.rotate(rot);
        x.fillStyle = cols[c.c];
        const sz = p.size * (H / 1080);
        const sq = Math.abs(Math.cos(c.y / 25 + c.ph * 3));
        if ((p.shape === 'circle' || (p.shape === 'mix' && c.c % 2))) { x.beginPath(); x.arc(0, 0, sz * .5, 0, 7); x.fill(); }
        else x.fillRect(-sz * .5, -sz * .18, sz, sz * .36 * Math.max(.15, sq));
        x.restore();
      }
      x.restore();
    }
  });

  /* ============ GRID (synthwave floor) ============ */
  L.register({
    id: 'grid', name: 'Perspective Grid', cat: 'Decor', icon: 'grid',
    desc: 'Synthwave floor with optional retro sun',
    defaults: () => ({ horizon: .55, lines: 14, vlines: 15, speed: 1.2, lineColor: '#22d3ee', lineWidth: 2, glow: 14, sun: true, sunColor: '#fb7185', sunSize: .32, sunStripes: 5, sunY: .5, bg: true, bgColor: '#0d0221', beatZoom: .3 }),
    params: [
      P.num('horizon', 'Horizon Y', .1, .95, .01, .55),
      P.num('lines', 'Horizontal lines', 3, 40, 1, 14), P.num('vlines', 'Vertical lines', 3, 40, 1, 15),
      P.num('speed', 'Scroll speed', 0, 6, .05, 1.2), P.color('lineColor', 'Line color'),
      P.num('lineWidth', 'Line width', .5, 10, .5, 2), P.num('glow', 'Glow', 0, 50, 1, 14),
      P.bool('sun', 'Retro sun'), P.color('sunColor', 'Sun color'), P.num('sunSize', 'Sun size', .05, .8, .01, .32),
      P.num('sunStripes', 'Sun stripes', 0, 12, 1, 5), P.num('sunY', 'Sun Y offset', 0, 1, .01, .5),
      P.bool('bg', 'Fill below horizon'), P.color('bgColor', 'Fill color'),
      P.num('beatZoom', 'Beat zoom', 0, 1, .05, .3),
    ],
    draw(x, st) {
      const { W, H, p, t, dt, a, layer } = st;
      if (layer._g === undefined) layer._g = 0;
      layer._g = (layer._g + p.speed * dt * (1 + a.bass * .8)) % 1;
      const hy = (p.horizon - .5) * H;
      x.save();
      x.translate(0, 0);
      if (p.bg) { x.fillStyle = p.bgColor; x.fillRect(-W, hy, W * 2, H); }
      if (p.sun) {
        const r = p.sunSize * Math.min(W, H) * (1 + a.bass * p.beatZoom * .2);
        const sy = hy - r * p.sunY * .9;
        const g = x.createLinearGradient(0, sy - r, 0, sy + r);
        g.addColorStop(0, U.shade(p.sunColor, .45)); g.addColorStop(1, p.sunColor);
        x.save();
        x.beginPath(); x.arc(0, sy, r, 0, 7); x.clip();
        x.fillStyle = g; x.fillRect(-r, sy - r, r * 2, r * 2);
        if (p.sunStripes > 0) {
          x.fillStyle = p.bg ? p.bgColor : '#000';
          for (let i = 0; i < p.sunStripes; i++) { const yy = sy + r * .1 + (i / p.sunStripes) * r * .95; x.fillRect(-r, yy, r * 2, Math.max(2, r * .07 * (1 + i * .4))); }
        }
        x.restore();
      }
      if (p.glow) { x.shadowBlur = p.glow * (H / 1080); x.shadowColor = p.lineColor; }
      x.strokeStyle = p.lineColor; x.lineWidth = p.lineWidth * (H / 1080);
      const n = Math.round(p.lines);
      for (let i = 0; i < n; i++) {
        const zz = (i + layer._g) / n;
        const yy = hy + Math.pow(zz, 2.4) * (H - hy) * 1.2;
        if (yy > H / 2 + 2) continue;
        x.globalAlpha = (st.alpha ?? 1) * U.clamp(.25 + zz, 0, 1);
        x.beginPath(); x.moveTo(-W / 2, yy); x.lineTo(W / 2, yy); x.stroke();
      }
      const vn = Math.round(p.vlines);
      for (let i = 0; i <= vn; i++) {
        const fx = -W * 1.6 + (W * 3.2) * i / vn;
        x.globalAlpha = (st.alpha ?? 1) * .8;
        x.beginPath(); x.moveTo(0, hy); x.lineTo(fx, H / 2 + 2); x.stroke();
      }
      x.restore();
    }
  });

  /* ============ SHAPE ============ */
  L.register({
    id: 'shape', name: 'Shape', cat: 'Decor', icon: 'shape',
    desc: 'Rectangle, circle, triangle, star, polygon',
    defaults: () => ({ shape: 'rect', w: .3, h: .3, corner: .12, fill: '#7c5cff5c', stroke: '#7c5cff', strokeWidth: 4, sides: 5, starInner: .45, glow: 16, pulse: 0, spin: 0 }),
    params: [
      P.sel('shape', 'Shape', [['rect', 'Rectangle'], ['circle', 'Circle / Ellipse'], ['triangle', 'Triangle'], ['star', 'Star'], ['poly', 'Polygon'], ['ring', 'Ring']], 'rect'),
      P.num('w', 'Width', .01, 2, .01, .3, { auto: true }), P.num('h', 'Height', .01, 2, .01, .3, { auto: true }),
      P.num('corner', 'Corner radius', 0, .5, .01, .12),
      P.color('fill', 'Fill'), P.color('stroke', 'Stroke'), P.num('strokeWidth', 'Stroke width', 0, 40, 1, 4),
      P.num('sides', 'Polygon sides', 3, 12, 1, 5), P.num('starInner', 'Star inner radius', .1, .95, .01, .45),
      P.num('glow', 'Glow', 0, 60, 1, 16), P.num('pulse', 'Bass pulse', 0, 1, .05, 0),
      P.num('spin', 'Spin (°/s)', -360, 360, 1, 0),
    ],
    draw(x, st) {
      const { W, H, p, a, t } = st;
      const k = 1 + a.bass * p.pulse * .35;
      const w = p.w * W * k, h = p.h * H * k;
      x.save();
      x.rotate(p.spin * t * Math.PI / 180);
      if (p.glow) { x.shadowBlur = p.glow * (H / 1080); x.shadowColor = p.stroke; }
      x.fillStyle = p.fill; x.strokeStyle = p.stroke; x.lineWidth = p.strokeWidth * (H / 1080);
      x.beginPath();
      if (p.shape === 'rect') {
        const r = Math.min(w, h) * p.corner;
        x.roundRect ? x.roundRect(-w / 2, -h / 2, w, h, r) : x.rect(-w / 2, -h / 2, w, h);
      } else if (p.shape === 'circle') x.ellipse(0, 0, w / 2, h / 2, 0, 0, 7);
      else if (p.shape === 'ring') { x.ellipse(0, 0, w / 2, h / 2, 0, 0, 7); x.moveTo(w / 2 - p.strokeWidth * 2, 0); x.ellipse(0, 0, w / 2 - p.strokeWidth * 2.5, h / 2 - p.strokeWidth * 2.5, 0, 0, 7); }
      else if (p.shape === 'triangle') { x.moveTo(0, -h / 2); x.lineTo(w / 2, h / 2); x.lineTo(-w / 2, h / 2); x.closePath(); }
      else if (p.shape === 'star') {
        const n = 5;
        for (let i = 0; i < n * 2; i++) { const ang = i / (n * 2) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? Math.min(w, h) / 2 * p.starInner : Math.min(w, h) / 2; const px2 = Math.cos(ang) * r, py = Math.sin(ang) * r; i === 0 ? x.moveTo(px2, py) : x.lineTo(px2, py); }
        x.closePath();
      } else {
        const n = Math.round(p.sides);
        for (let i = 0; i <= n; i++) { const ang = i / n * Math.PI * 2 - Math.PI / 2; const px2 = Math.cos(ang) * w / 2, py = Math.sin(ang) * h / 2; i === 0 ? x.moveTo(px2, py) : x.lineTo(px2, py); }
      }
      if (p.fill !== 'transparent' && p.shape !== 'ring') x.fill();
      if (p.strokeWidth > 0) x.stroke();
      x.restore();
    }
  });
})();
