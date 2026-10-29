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
})();
