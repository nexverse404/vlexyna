/* Vlexyna — exporter.js — video / PNG / frame-sequence export */
'use strict';
(() => {
  const E = VX.exporter = {};
  E.active = false;

  const MIMES = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  E.bestMime = () => MIMES.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || null;
  E.extFor = (mime) => (mime || '').includes('mp4') ? 'mp4' : 'webm';

  E.snapshotPNG = () => {
    const proj = VX.project.current;
    const c = document.createElement('canvas');
    c.width = proj.width; c.height = proj.height;
    VX.renderer.render(c, VX.app.time, { dt: 1 / 60, playing: false });
    c.toBlob(b => U.download(b, `${proj.name.replace(/[^\w\- ]+/g, '') || 'frame'}_${Math.round(VX.app.time * 100) / 100}s.png`), 'image/png');
    U.toast('Frame saved as PNG');
  };

  E.exportVideo = async (opts) => {
    if (E.active) return;
    const proj = VX.project.current;
    const eng = VX.audio.engine;
    opts = opts || {};
    const fps = opts.fps || proj.fps || 60;
    const mime = E.bestMime();
    if (!mime) { U.toast('This browser cannot record video — try Chrome or Firefox', 'err'); return; }
    const duration = eng.duration || proj.duration || 30;
    if (!eng.buffer || !eng.recDest) opts.includeAudio = false;

    E.active = true;
    E._cancelled = false;
    E.cancel = () => { E._cancelled = true; };
    VX.app.exporting = true;
    const badge = document.getElementById('exportBadge');
    if (badge) badge.style.display = '';
    const wasLoop = eng.loop; eng.loop = false;

    const c = document.createElement('canvas');
    c.width = proj.width; c.height = proj.height;
    const cx = c.getContext('2d');
    const stream = c.captureStream(fps);
    if (opts.includeAudio) for (const tr of eng.recDest.stream.getAudioTracks()) stream.addTrack(tr);

    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: opts.bitrate || 16e6,
      audioBitsPerSecond: 192000
    });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    const done = new Promise(res => { rec.onstop = res; });
    rec.start(500);

    /* mute monitor if requested */
    const oldVol = eng.volume;
    if (!opts.monitor) eng.setVolume(0);

    VX.app.pause();
    VX.app.time = 0;
    if (eng.buffer) { eng.seek(0); await eng.resume(); eng.play(); }

    let cancelled = false;
    const t0 = performance.now();
    let last = t0;

    await new Promise(resolve => {
      const step = () => {
        const now = performance.now();
        const dt = U.clamp((now - last) / 1000, 0, .1); last = now;
        eng.tick(dt);
        let t;
        if (eng.buffer) { t = eng.playing ? eng.time : VX.app.time; }
        else { VX.app.time += dt; t = VX.app.time; } /* virtual clock when no audio loaded */
        VX.app.time = Math.min(t, duration);
        VX.renderer.render(c, t, { dt, playing: true });
        VX.app.onExportProgress && VX.app.onExportProgress(U.clamp(t / duration, 0, 1), t, duration);
        if (E._cancelled || cancelled || t >= duration - 1 / 30) {
          cancelled = E._cancelled;
          resolve(); return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    eng.pause();
    eng.setVolume(oldVol);
    eng.loop = wasLoop;
    if (badge) badge.style.display = 'none';
    await new Promise(r => setTimeout(r, 350));
    try { rec.stop(); } catch (e) { }
    await done;
    VX.app.exporting = false;
    E.active = false;
    E.cancel = null;

    if (cancelled) { U.toast('Export cancelled'); VX.ui && VX.ui.updateTransport(); return; }
    const blob = new Blob(chunks, { type: mime });
    U.download(blob, `${proj.name.replace(/[^\w\- ]+/g, '') || 'vlexyna'}_${proj.height}p.${E.extFor(mime)}`);
    U.toast(`Video exported — ${U.fmtBytes(blob.size)} (${E.extFor(mime).toUpperCase()})`);
    VX.app.onExportProgress = null;
    VX.app.time = 0;
    VX.ui && VX.ui.updateTransport();
  };

  /* offline frame sequence (no audio reactivity) */
  E.exportFrames = async (opts) => {
    if (E.active) return;
    const proj = VX.project.current;
    opts = opts || {};
    const fps = Math.min(30, Math.max(1, opts.fps || 12));
    const duration = VX.audio.engine.duration || proj.duration || 30;
    E.active = true; E._cancelled = false;
    E.cancel = () => { E._cancelled = true; };
    VX.app.exporting = true;
    const badge = document.getElementById('exportBadge');
    if (badge) badge.style.display = '';
    const c = document.createElement('canvas');
    c.width = proj.width; c.height = proj.height;
    const zip = new U.ZipWriter();
    const total = Math.floor(duration * fps);
    for (let i = 0; i < total; i++) {
      const t = i / fps;
      VX.renderer.render(c, t, { dt: 1 / fps, playing: false });
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      zip.add(`frame_${String(i).padStart(5, '0')}.png`, new Uint8Array(await blob.arrayBuffer()));
      VX.app.onExportProgress && VX.app.onExportProgress(i / total, t, duration);
      if (i % 4 === 0) await new Promise(r => setTimeout(r, 0));
      if (E._cancelled || !E.active) break;
    }
    VX.app.exporting = false; E.active = false; E.cancel = null;
    if (badge) badge.style.display = 'none';
    const zb = await zip.blob();
    U.download(zb, `${proj.name.replace(/[^\w\- ]+/g, '') || 'vlexyna'}_frames.zip`);
    U.toast(`Exported ${total} frames — ${U.fmtBytes(zb.size)}`);
  };
})();
