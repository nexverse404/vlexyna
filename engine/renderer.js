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
    const env = R._env || (R._env = {});
    env.t = t; env.dt = dt; env.bass = a.bass; env.mid = a.mid; env.treble = a.treble;
    env.level = a.level; env.beat = a.beat;
    env.pi = Math.PI; env.e = Math.E;
    env.v1 = vars.v1 || 0; env.v2 = vars.v2 || 0; env.v3 = vars.v3 || 0; env.v4 = vars.v4 || 0;
    /* audio analyzers — an('Name') works with any name; bare identifiers too */
    const eng = VX.audio.engine;
    env.an = (name) => eng.anValues ? (eng.anValues[name] || 0) : 0;
    if (eng.anValues) for (const k of Object.keys(eng.anValues)) {
      const id = k.replace(/[^A-Za-z0-9_]/g, '');
      if (id && !(id in env) && !R._RESERVED.has(id)) env[id] = eng.anValues[k];
    }
    /* named global variables — usable directly in every math automation.
       The valid-name list is cached; vars keys rarely change. */
    const keys = Object.keys(vars);
    if (!R._vkCache || R._vkCache.src !== keys.join(',')) {
      R._vkCache = { src: keys.join(','), names: keys.filter(k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) };
    }
    for (const k of R._vkCache.names) if (!(k in env)) env[k] = +vars[k] || 0;
    return env;
  };
  R._RESERVED = new Set(['t', 'dt', 'bass', 'mid', 'treble', 'level', 'beat', 'pi', 'e', 'v1', 'v2', 'v3', 'v4', 'an',
    'sin', 'cos', 'tan', 'abs', 'min', 'max', 'floor', 'ceil', 'sqrt', 'pow', 'log', 'exp', 'sign', 'clamp', 'lerp',
    'freq', 'fft', 'random', 'delta', 'atan2', 'hypot', 'trunc', 'if']);

  R.autoDelta = (layer, key, env, dt) => {
    const a = layer.auto && layer.auto[key];
    if (!a) return 0;
    let v = 0;
    /* v2 model: a plain string is a full expression — “beat*0.3”, “sin(t*2)*.2” */
    if (typeof a === 'string') {
      if (!a.trim()) return 0;
      try { v = VX.expr.compile(a)(env) || 0; } catch (e) { return 0; }
    } else if (typeof a === 'object') {
      /* v3 model: { expr, enabled, min, max, smooth } — per-automation shaping */
      if (a.enabled === false) return 0;
      if (a.src === 'expr' || a.src === 'none') {              /* v1 legacy objects */
        if (!a.src) { if (!a.expr) return 0; try { v = VX.expr.compile(a.expr)(env) || 0; } catch (e) { return 0; } }
        else if (a.src === 'expr') { if (!a.expr) return 0; try { v = VX.expr.compile(a.expr)(env) || 0; } catch (e) { return 0; } }
        else { v = (env[a.src] || 0) * (a.amt || 0); }
      } else {
        if (!a.expr || !String(a.expr).trim()) return 0;
        try { v = VX.expr.compile(a.expr)(env) || 0; } catch (e) { return 0; }
        if (a.smooth > 0) {
          const sm = U.clamp(+a.smooth, 0, .95);
          if (!layer._asm) layer._asm = {};
          const prev = layer._asm[key] ?? v;
          v = prev + (v - prev) * (1 - Math.pow(sm, (dt || 1 / 60) * 60));
          layer._asm[key] = v;
        }
        if (a.min != null) v = Math.max(+a.min, v);
        if (a.max != null) v = Math.min(+a.max, v);
      }
      if (a.src && a.src !== 'expr' && a.src !== 'none' && !a.expr) { /* v1 src/amt */ }
      return v;
    } else return 0;
    return v;
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
    /* one scratch audio object for the whole frame — no per-frame allocation */
    const a = R._a || (R._a = {});
    if (eng.bands) { a.bass = eng.bands.bass; a.mid = eng.bands.mid; a.treble = eng.bands.treble; a.level = eng.bands.level; }
    else { a.bass = a.mid = a.treble = a.level = 0; }
    a.beat = eng.beat; a.beatCount = eng.beatCount; a.wave = eng.wave;
    /* named analyzers feed an('Name') + bare identifiers in expressions */
    if (proj.analyzers && proj.analyzers.length) eng.computeAnalyzers(proj.analyzers, opts.dt || 1 / 60);
    else if (eng.anValues) eng.anValues = {};
    const env = R.envFor(t, opts.dt || 0, a, proj.vars || {});
    const duration = eng.duration || proj.duration || 30;
    const playing = opts.playing !== undefined ? opts.playing : eng.playing;

    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
    if (x.imageSmoothingQuality !== undefined) x.imageSmoothingQuality = 'high';
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);

    for (const layer of proj.layers) {
      try {
        if (!R.layerVisible(layer, t)) continue;
        const def = VX.layers.byId[layer.type];
        if (!def) continue;
        const dta = opts.dt || 0;
        const ax = U.clamp(layer.x + R.autoDelta(layer, 'x', env, dta), -2, 3) * W;
        const ay = U.clamp(layer.y + R.autoDelta(layer, 'y', env, dta), -2, 3) * H;
        const scale = Math.max(0.001, layer.scale + R.autoDelta(layer, 'scale', env, dta));
        const rot = (layer.rotation + R.autoDelta(layer, 'rotation', env, dta)) * Math.PI / 180;
        let alpha = U.clamp(layer.opacity + R.autoDelta(layer, 'opacity', env, dta), 0, 1);
        if (alpha <= 0.001) continue;

        /* resolved props (base + automation) — scratch object, cleared per layer */
        const p = R._p || (R._p = {});
        for (const k of Object.keys(p)) delete p[k];
        Object.assign(p, layer.props);
        for (const key of Object.keys(layer.auto || {})) if (key in p) p[key] += R.autoDelta(layer, key, env, dta);

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

  /* ---------- dirty flag: paused + unchanged = no redraw (idle CPU ≈ 0) ---------- */
  R.dirty = true;
  R.invalidate = () => { R.dirty = true; };

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
        /* skip the whole render when paused and nothing changed */
        if (app.playing || R.dirty) {
          R.drawPreview(dt);
          R.dirty = false;
        }
        app.onFrame && app.onFrame(dt);
      }
      R._fpsN++; R._fpsT += dt;
      if (R._fpsT >= .5) {
        R.fps = Math.round(R._fpsN / R._fpsT); R._fpsN = 0; R._fpsT = 0;
        if (VX.ui) VX.ui.updateFPS();
        R._adaptFps();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  /* adaptive quality: sustained low fps scales the preview down (min 360p floor
     of the chosen quality), recovery steps it back up. Export renders are untouched. */
  R.autoScale = 1;
  R._lowN = 0; R._okN = 0;
  R._adaptFps = () => {
    if (VX.app && VX.app.exporting) return;
    if (R.fps > 0 && R.fps < 42) { R._lowN++; R._okN = 0; } else if (R.fps >= 55) { R._okN++; R._lowN = 0; } else return;
    if (R._lowN >= 4 && R.autoScale > .34) { R.autoScale = Math.max(.3, R.autoScale / 2); R._lowN = 0; R.invalidate(); }
    else if (R._okN >= 8 && R.autoScale < 1) { R.autoScale = Math.min(1, R.autoScale * 2); R._okN = 0; R.invalidate(); }
  };

  R.drawPreview = (dt) => {
    const proj = VX.project.current;
    const c = R.previewCanvas;
    if (!proj || !c) return;
    const q = VX.app.previewQuality; /* max dimension */
    const auto = VX.app.playing ? R.autoScale : 1;   /* only throttle live playback, keep edits crisp */
    const target = (q === 0 ? 1 : Math.min(1, q / Math.max(proj.width, proj.height))) * auto;
    const w = Math.max(2, Math.round(proj.width * target * (VX.app.zoom || 1)));
    const h = Math.max(2, Math.round(proj.height * target * (VX.app.zoom || 1)));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    R.render(c, VX.app.time, { dt, playing: VX.app.playing });
    VX.ui && VX.ui.drawOverlay && VX.ui.drawOverlay();
  };
})();
