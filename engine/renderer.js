/* Vlexyna — renderer.js — frame composition engine */
'use strict';
import { VX, U } from './util.js';
(() => {
  const R = VX.renderer = {};
  R.buffers = [null, null];
  const getBuf = (i, w, h) => {
    if (!R.buffers[i]) R.buffers[i] = document.createElement('canvas');
    const c = R.buffers[i];
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  };

  R.envFor = (t, dt, a, vars) => {
    const env = {
      t, dt, bass: a.bass, mid: a.mid, treble: a.treble, level: a.level, beat: a.beat,
      pi: Math.PI, e: Math.E,
      v1: vars.v1 || 0, v2: vars.v2 || 0, v3: vars.v3 || 0, v4: vars.v4 || 0
    };
    /* named global variables — usable directly in every math automation */
    for (const k of Object.keys(vars)) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !(k in env)) env[k] = +vars[k] || 0;
    }
    return env;
  };

  R.autoDelta = (layer, key, env) => {
    const a = layer.auto && layer.auto[key];
    if (!a) return 0;
    /* v2 model: a plain string is a full expression — “beat*0.3”, “sin(t*2)*.2” */
    if (typeof a === 'string') {
      if (!a.trim()) return 0;
      try { return VX.expr.compile(a)(env) || 0; } catch (e) { return 0; }
    }
    /* v1 model (kept for older saved projects): { src, amt } or { src: 'expr', expr } */
    if (!a.src || a.src === 'none') return 0;
    if (a.src === 'expr') {
      if (!a.expr) return 0;
      try { return VX.expr.compile(a.expr)(env) || 0; } catch (e) { return 0; }
    }
    const v = env[a.src] || 0;
    return v * (a.amt || 0);
  };

  R.layerVisible = (l, t) => l.visible && l.opacity > 0.001 && (l.start || 0) <= t + 1e-4 && (l.end === null || l.end === undefined || l.end >= t - 1e-4);

  /* render one frame of project at time t onto canvas */
  R.render = (canvas, t, opts) => {
    const proj = VX.project.current;
    if (!proj) return;
    const x = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    opts = opts || {};
    const eng = VX.audio.engine;
    const a = eng.bands ? { ...eng.bands, beat: eng.beat, beatCount: eng.beatCount, wave: eng.wave } : { bass: 0, mid: 0, treble: 0, level: 0, beat: 0, beatCount: 0, wave: new Float32Array(2048) };
    const env = R.envFor(t, opts.dt || 0, a, proj.vars || {});
    const duration = eng.duration || proj.duration || 30;
    const playing = opts.playing !== undefined ? opts.playing : eng.playing;

    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);

    for (const layer of proj.layers) {
      try {
        if (!R.layerVisible(layer, t)) continue;
        const def = VX.layers.byId[layer.type];
        if (!def) continue;
        const ax = U.clamp(layer.x + R.autoDelta(layer, 'x', env), -2, 3) * W;
        const ay = U.clamp(layer.y + R.autoDelta(layer, 'y', env), -2, 3) * H;
        const scale = Math.max(0.001, layer.scale + R.autoDelta(layer, 'scale', env));
        const rot = (layer.rotation + R.autoDelta(layer, 'rotation', env)) * Math.PI / 180;
        let alpha = U.clamp(layer.opacity + R.autoDelta(layer, 'opacity', env), 0, 1);
        if (alpha <= 0.001) continue;

        /* resolved props (base + automation) */
        const p = { ...layer.props };
        for (const key of Object.keys(layer.auto || {})) if (key in p) p[key] += R.autoDelta(layer, key, env);

        const st = {
          W, H, t, dt: opts.dt || 0, a, p, layer, env, playing, time: t, duration,
          project: proj, alpha, layerLocal: t - (layer.start || 0), frameBefore: null
        };
        /* snapshot the frame-so-far for the Render Layer effect */
        if (layer.fx && layer.fx.some(f => f.enabled && f.id === 'renderlayer')) {
          const snap = getBuf(1, W, H);
          const sx2 = snap.getContext('2d');
          sx2.setTransform(1, 0, 0, 1, 0, 0); sx2.globalAlpha = 1; sx2.globalCompositeOperation = 'source-over'; sx2.filter = 'none';
          sx2.clearRect(0, 0, W, H);
          sx2.drawImage(canvas, 0, 0);
          st.frameBefore = snap;
        }

        const needsBuffer = (layer.fx && layer.fx.length) || layer.mirror !== 'none';
        if (!needsBuffer && !def.noTransform) {
          x.save();
          x.globalAlpha = alpha;
          x.globalCompositeOperation = layer.blend || 'source-over';
          x.translate(ax, ay); x.rotate(rot); x.scale(scale, scale);
          def.draw(x, st);
          x.restore();
        } else if (!needsBuffer && def.noTransform) {
          x.save();
          x.globalAlpha = alpha;
          x.globalCompositeOperation = layer.blend || 'source-over';
          def.draw(x, st);
          x.restore();
        } else {
          const buf = getBuf(0, W, H);
          const bx = buf.getContext('2d');
          bx.setTransform(1, 0, 0, 1, 0, 0);
          bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over'; bx.filter = 'none';
          bx.clearRect(0, 0, W, H); /* keep buffer transparent — it composites over lower layers */
          if (def.noTransform) {
            bx.save(); bx.globalAlpha = alpha; def.draw(bx, st); bx.restore();
          } else {
            bx.save();
            bx.translate(ax, ay); bx.rotate(rot); bx.scale(scale, scale);
            def.draw(bx, st);
            bx.restore();
          }
          let out = buf;
          if (layer.fx && layer.fx.length) out = VX.fx.apply(buf, layer.fx, st);
          x.save();
          x.globalAlpha = alpha;
          x.globalCompositeOperation = layer.blend || 'source-over';
          if (layer.mirror && layer.mirror !== 'none') {
            x.translate(ax, ay);
            if (layer.mirror === 'h' || layer.mirror === 'quad') x.scale(-1, 1);
            if (layer.mirror === 'v' || layer.mirror === 'quad') x.scale(1, -1);
            x.translate(-ax, -ay);
          }
          x.drawImage(out, 0, 0);
          x.restore();
        }
      } catch (e) { console.warn('layer error:', layer.type, e); }
    }

    /* camera — one global audio-reactive transform over the whole composition.
       zoom punches in with bass/beats, pan/rotate drift, shake jolts on impact. */
    const cam = proj.camera;
    if (cam && cam.on) {
      const zoom = Math.max(.05, (cam.zoom ?? 1) + a.bass * (cam.zoomBass || 0) + a.beat * (cam.zoomBeat || 0));
      const rot = (((cam.rot || 0)) + (cam.rotBeat || 0) * a.beat) * Math.PI / 180;
      const shakePx = ((cam.shake || 0) + (cam.shakeBeat || 0) * a.beat) * W * .01;
      const fq = Math.floor(t * 60);   /* shake re-rolls at 60 Hz */
      const px = (cam.x || 0) * W + (shakePx ? (U.hash(fq * 1.7) - .5) * 2 * shakePx : 0);
      const py = (cam.y || 0) * H + (shakePx ? (U.hash(fq * 3.1 + 7) - .5) * 2 * shakePx : 0);
      const jr = shakePx ? (U.hash(fq * 5.3 + 13) - .5) * 2 * (cam.rotShake ?? 1) * Math.PI / 180 * Math.min(1, shakePx / (W * .01)) : 0;
      R.lastCam = { zoom, px, py, rot: rot + jr };   /* test/inspection hook */
      if (Math.abs(zoom - 1) > 1e-4 || rot || jr || Math.abs(px) > .5 || Math.abs(py) > .5) {
        const buf = getBuf(2, W, H);
        const bx2 = buf.getContext('2d');
        bx2.setTransform(1, 0, 0, 1, 0, 0); bx2.globalAlpha = 1; bx2.globalCompositeOperation = 'source-over'; bx2.filter = 'none';
        bx2.clearRect(0, 0, W, H);
        bx2.drawImage(canvas, 0, 0);
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
        x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
        x.save();
        x.translate(W / 2 + px, H / 2 + py);
        x.rotate(rot + jr);
        x.scale(zoom, zoom);
        x.drawImage(buf, -W / 2, -H / 2);
        x.restore();
      }
    }

    /* global post FX */
    if (proj.post && proj.post.length) {
      const main = canvas;
      const out = VX.fx.apply(main, proj.post, { t });
      if (out !== main) {
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
        x.clearRect(0, 0, W, H);
        x.drawImage(out, 0, 0);
      }
    }
  };

  /* ---------- main preview loop ---------- */
  R.previewCanvas = null;
  R.previewScale = 1;
  R.running = false;
  R._last = 0;
  R.fps = 0; R._fpsN = 0; R._fpsT = 0;

  R.start = (canvas) => {
    R.previewCanvas = canvas;
    if (R.running) return;
    R.running = true;
    R._last = performance.now();
    const loop = (now) => {
      if (!R.running) return;
      const dt = U.clamp((now - R._last) / 1000, 0, .1);
      R._last = now;
      const app = VX.app;
      const eng = VX.audio.engine;
      eng.tick(dt);
      if (!app.exporting) {
        if (app.playing) {
          if (eng.buffer) app.time = eng.time;
          else app.time = (app.time + dt) % (app.duration || 30);
        }
        R.drawPreview(dt);
        app.onFrame && app.onFrame(dt);
      }
      R._fpsN++; R._fpsT += dt;
      if (R._fpsT >= .5) { R.fps = Math.round(R._fpsN / R._fpsT); R._fpsN = 0; R._fpsT = 0; if (VX.ui) VX.ui.updateFPS(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  R.drawPreview = (dt) => {
    const proj = VX.project.current;
    const c = R.previewCanvas;
    if (!proj || !c) return;
    const q = VX.app.previewQuality; /* max dimension */
    const target = q === 0 ? 1 : Math.min(1, q / Math.max(proj.width, proj.height));
    const w = Math.max(2, Math.round(proj.width * target * (VX.app.zoom || 1)));
    const h = Math.max(2, Math.round(proj.height * target * (VX.app.zoom || 1)));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    R.render(c, VX.app.time, { dt, playing: VX.app.playing });
    VX.ui && VX.ui.drawOverlay && VX.ui.drawOverlay();
  };
})();
