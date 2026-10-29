/* Vlexyna — layers3.js — Lottie animation layer (lottie-web, lazy-loaded) */
'use strict';
import { VX, U } from './util.js';
(() => {
  const P = VX.P, L = VX.layers, A = VX.assets;

  /* lottie-web is an optional peer: loaded on first use so the engine itself
     stays dependency-free. In no-build contexts the bare specifier fails and
     we fall back to window.lottie (script-tag build) or a friendly placeholder. */
  let lottieMod = undefined; /* undefined = not tried yet, null = unavailable */
  async function ensureLottie() {
    if (lottieMod !== undefined) return lottieMod;
    try {
      const m = await import('lottie-web');
      lottieMod = m && m.default ? m.default : m;
    } catch (e) {
      lottieMod = (typeof window !== 'undefined' && window.lottie) || null;
    }
    return lottieMod;
  }
  L.ensureLottie = ensureLottie;

  function destroyLot(layer) {
    if (layer._lot) {
      try { layer._lot.anim.destroy(); } catch (e) { }
      if (layer._lot.wrap && layer._lot.wrap.parentNode) layer._lot.wrap.parentNode.removeChild(layer._lot.wrap);
      layer._lot = null;
    }
    layer._lotAsset = null;
  }

  /* sync helper — kicks off async setup, returns the ready animation or null */
  function ensureLot(layer, asset) {
    if (layer._lotAsset === asset.id && layer._lot) return layer._lot;
    destroyLot(layer);
    layer._lotAsset = asset.id;
    layer._lotLoading = true;
    ensureLottie().then(lottie => {
      layer._lotLoading = false;
      if (!lottie || layer._lotAsset !== asset.id) return;
      try {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;left:-99999px;top:0;width:512px;height:512px;pointer-events:none;opacity:0;';
        document.body.appendChild(wrap);
        const anim = lottie.loadAnimation({
          container: wrap, renderer: 'canvas', loop: true, autoplay: true,
          animationData: asset.data, rendererSettings: { progressiveLoad: false },
        });
        layer._lot = { anim, canvas: wrap.querySelector('canvas'), wrap };
      } catch (e) {
        layer._lotErr = String(e && e.message || e);
      }
    });
    return null;
  }

  L.register({
    id: 'lottie', name: 'Lottie', cat: 'Media', icon: 'star',
    desc: 'Lottie .json animation — free-running or synced to the music',
    defaults: () => ({ assetId: '', fit: 'contain', size: .5, sync: 'free', speed: 1, react: 0, pulse: 0, spin: 0 }),
    params: [
      P.file('assetId', 'Animation (.json)', '.json,application/json'),
      P.sel('fit', 'Fit', [['contain', 'Contain'], ['cover', 'Cover']], 'contain'),
      P.num('size', 'Size', .05, 3, .01, .5, { auto: true }),
      P.sel('sync', 'Timeline', [['free', 'Free run'], ['music', 'Sync to music time']], 'free'),
      P.num('speed', 'Speed', .1, 4, .05, 1),
      P.num('react', 'Level → speed', 0, 3, .05, 0, { auto: true }),
      P.num('pulse', 'Bass pulse', 0, 1, .01, 0),
      P.num('spin', 'Spin (°/s)', -360, 360, 1, 0),
    ],
    draw(x, st) {
      const { H, p, a, t, layer } = st;
      const asset = A.get(p.assetId);
      if (!asset || asset.kind !== 'json' || !asset.data) {
        x.strokeStyle = '#3a4258'; x.setLineDash([10, 8]); x.lineWidth = 3;
        x.strokeRect(-p.size * H / 2, -p.size * H / 2, p.size * H, p.size * H); x.setLineDash([]);
        x.fillStyle = '#5b6478'; x.font = `${26 * H / 1080}px sans-serif`; x.textAlign = 'center';
        x.fillText('Pick a Lottie .json file →', 0, 8);
        return;
      }
      const lot = ensureLot(layer, asset);
      if (!lot || !lot.canvas) {
        x.fillStyle = '#5b6478'; x.font = `${22 * H / 1080}px sans-serif`; x.textAlign = 'center';
        x.fillText(layer._lotErr ? 'Lottie error' : 'Loading animation…', 0, 8);
        return;
      }
      const anim = lot.anim, cvs = lot.canvas;
      if (p.sync === 'music') {
        const fr = Math.max(1e-6, anim.frameRate || 30);
        const dur = Math.max(.01, (anim.totalFrames || 30) / fr);
        anim.goToAndStop(((t * p.speed) % dur) * fr, true);
      } else {
        try { anim.setSpeed(Math.max(.05, p.speed * (1 + a.level * p.react))); } catch (e) { }
      }
      const iw = cvs.width || 512, ih = cvs.height || 512;
      const k = 1 + a.bass * p.pulse * .5;
      const w = p.size * H * k, h = p.size * H * k;
      const s = p.fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
      const dw = iw * s, dh = ih * s;
      x.save();
      if (p.spin) x.rotate(t * p.spin * Math.PI / 180);
      x.drawImage(cvs, -dw / 2, -dh / 2, dw, dh);
      x.restore();
    },
  });

  /* ============ BUTTERCHURN (MilkDrop-style WebGL visualizer) ============
     The crown jewel of vizzy's item list — butterchurn (MIT, jberg) renders
     classic MilkDrop presets. Lazy-loaded; needs WebGL. Preset list loads from
     butterchurn-presets' Minimal pack (~190 KB) with graceful fallback. */
  L.register({
    id: 'butterchurn', name: 'Butterchurn', cat: 'Visuals', icon: 'spark',
    desc: 'MilkDrop-style preset visualizer (butterchurn) — hundreds of classic presets',
    defaults: () => ({ preset: '', blendRate: .5, react: 1, quality: .75, presetPack: 'minimal' }),
    params: [
      P.sel('preset', 'Preset', () => BC.presetOptions(), ''),
      P.num('blendRate', 'Preset blend time (s)', .1, 4, .1, .5),
      P.num('react', 'Audio drive', 0, 2, .05, 1),
      P.num('quality', 'Resolution scale', .2, 1, .05, .75),
      P.group('Pack', [
        P.sel('presetPack', 'Preset pack', [['minimal', 'Minimal (fast load)'], ['base', 'Base (hundreds)']], 'minimal'),
        P.act('bc_rand', 'Random preset now', (l) => { const o = BC.presetOptions(); if (o.length) { l.props.preset = o[Math.floor(Math.random() * o.length)][0]; l._bcDirty = true; } }),
      ]),
    ],
    draw(x, st) {
      const { W, H, p, t, a, layer, dt } = st;
      if (!BC.ready() && !BC.loading()) BC.load(p.presetPack);
      const bc = layer._bc;
      if (!bc) { /* not loaded (or no WebGL) — honest placeholder */
        x.save();
        x.fillStyle = '#0a0c14'; x.fillRect(-W / 2, -H / 2, W, H);
        x.fillStyle = '#8b93a8'; x.font = `${34 * H / 1080}px sans-serif`; x.textAlign = 'center';
        x.fillText(BC.failed() ? 'Butterchurn unavailable (needs WebGL)' : 'Loading Butterchurn…', 0, 0);
        x.restore();
        return;
      }
      /* preset switch */
      const opts = BC.presetOptions();
      let name = p.preset;
      if (!name && opts.length) { name = opts[0][0]; }
      if (layer._bcPreset !== name) {
        layer._bcPreset = name;
        const preset = BC.presets()[name];
        if (preset) bc.loadPreset(preset, p.blendRate);
      }
      /* feed audio: butterchurn wants time-domain byte arrays (1024, 128-centered) */
      const eng = VX.audio.engine;
      const wave = BC.waveBytes(eng);
      const drive = U.clamp(p.react, 0, 2);
      try {
        bc.setRendererSize(Math.max(64, Math.round(W * U.clamp(p.quality, .2, 1))), Math.max(64, Math.round(H * U.clamp(p.quality, .2, 1))));
        bc.updateAudio(wave, wave, wave);
        bc.render({
          audioLevels: { bass: a.bass * drive, mid: a.mid * drive, treble: a.treble * drive, volume: a.level * drive },
          elapsedTime: t,
        });
        x.drawImage(BC._canvas, -W / 2, -H / 2, W, H);
      } catch (e) {
        layer._bc = null; layer._bcPreset = null;
      }
    },
  });

  const BC = VX.bc = {
    _state: 'idle', _bc: null, _presets: {}, _canvas: null, _gl: null,
    load(pack) {
      if (this._state === 'loading' || this._state === 'ready') return;
      this._state = 'loading';
      /* WebGL canvas first */
      try {
        this._canvas = document.createElement('canvas');
        this._gl = this._canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true });
        if (!this._gl) throw new Error('no webgl');
      } catch (e) { this._state = 'failed'; return; }
      Promise.all([
        import('butterchurn').then(m => {
          const mod = m.default && m.default.default ? m.default.default : (m.default || m);
          this._bc = new mod(null, this._canvas, { width: 640, height: 360, pixelRatio: 1, textureRatio: 1 });
        }),
        (pack === 'base'
          ? import('butterchurn-presets').then(m => (m.default && m.default.default ? m.default.default : (m.default || m)))()
          : import('butterchurn-presets/lib/butterchurnPresetsMinimal.min.js').then(m => (m.default && m.default.default ? m.default.default : (m.default || m)))()
        ).catch(() => ({})),
      ]).then(([, presets]) => {
        this._presets = presets || {};
        this._state = 'ready';
        VX.ui && VX.ui.refreshAll && VX.ui.refreshAll();
      }).catch(() => { this._state = 'failed'; });
    },
    /* engine wave (-1..1 Float32, 2048) → butterchurn time-domain bytes (1024) */
    waveBytes(eng) {
      const out = this._wb || (this._wb = new Uint8Array(1024));
      const w = eng && eng.wave;
      if (w && w.length) {
        const step = w.length / 1024;
        for (let i = 0; i < 1024; i++) {
          const v = w[Math.floor(i * step)] || 0;
          out[i] = Math.max(0, Math.min(255, 128 + v * 127));
        }
      } else out.fill(128);
      return out;
    },
    ready: () => BC._state === 'ready' && !!BC._bc,
    loading: () => BC._state === 'loading',
    failed: () => BC._state === 'failed',
    presets: () => BC._presets || {},
    presetOptions: () => Object.keys(BC._presets || {}).sort().map(n => [n, n]),

  };
})();
