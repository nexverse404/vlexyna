/* Vlexyna — offline.js — precomputed audio timeline + exact-frame offline export.
   The live engine reads bands/spectrum from a WebAudio AnalyserNode, which only
   exists in real time. This module re-derives the exact same signals (spectrum,
   bass/mid/treble/level, beat) from the decoded AudioBuffer with a hand-rolled
   FFT, so offline renders (MP4 via mediabunny/WebCodecs, PNG sequences) are
   fully audio-reactive and frame-exact — no realtime dependency. */
'use strict';
import { VX, U } from './util.js';
(() => {
  const OFF = VX.offline = {};
  OFF.active = false;

  /* ---------------- FFT (radix-2, iterative) ---------------- */
  const FFT_N = 4096; /* same size as the live analyser → identical bin layout */
  const BINS = FFT_N / 2;
  let _rev = null, _cos = null, _sin = null;
  function fftInit() {
    if (_rev) return;
    let bits = 0; while ((1 << bits) < FFT_N) bits++;
    _rev = new Uint32Array(FFT_N);
    for (let i = 0; i < FFT_N; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1);
      _rev[i] = r;
    }
    const half = FFT_N / 2;
    _cos = new Float64Array(half); _sin = new Float64Array(half);
    for (let i = 0; i < half; i++) { _cos[i] = Math.cos(-2 * Math.PI * i / FFT_N); _sin[i] = Math.sin(-2 * Math.PI * i / FFT_N); }
  }
  function fft(re, im) {
    for (let i = 0; i < FFT_N; i++) {
      const j = _rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= FFT_N; size <<= 1) {
      const half = size >> 1, step = FFT_N / size;
      for (let i = 0; i < FFT_N; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const c = _cos[k], s = _sin[k];
          const tre = re[j + half] * c - im[j + half] * s;
          const tim = re[j + half] * s + im[j + half] * c;
          re[j + half] = re[j] - tre; im[j + half] = im[j] - tim;
          re[j] += tre; im[j] += tim;
        }
      }
    }
  }

  /* ---------------- timeline precompute ---------------- */
  OFF.FFT_N = FFT_N;
  OFF.BINS = BINS;

  OFF.precompute = async (buffer, fps = 60, onProgress) => {
    if (!buffer || !buffer.getChannelData) throw new Error('offline.precompute needs an AudioBuffer');
    fps = U.clamp(Math.round(fps) || 60, 1, 120);
    const sr = buffer.sampleRate || 44100;
    const chs = Math.max(1, Math.min(2, buffer.numberOfChannels || 1));
    const chans = [];
    for (let c = 0; c < chs; c++) chans.push(buffer.getChannelData(c));
    const len = chans[0].length;
    const duration = buffer.duration || (len / sr);
    const total = Math.max(1, Math.floor(duration * fps));
    fftInit();
    const win = new Float64Array(FFT_N);
    for (let i = 0; i < FFT_N; i++) win[i] = .5 * (1 - Math.cos(2 * Math.PI * i / (FFT_N - 1)));
    const re = new Float64Array(FFT_N), im = new Float64Array(FFT_N);
    const freq = new Uint8Array(total * BINS);
    const bass = new Float32Array(total), mid = new Float32Array(total), treble = new Float32Array(total), level = new Float32Array(total);
    const beat = new Float32Array(total);
    let beatCount = 0, lastBeat = -1;
    const sm = { bass: 0, mid: 0, treble: 0, level: 0 };
    const hist = [];
    const prev = new Float32Array(BINS);
    const nyquist = sr / 2;
    const binOf = (f) => U.clamp(Math.round(f / nyquist * BINS), 0, BINS - 1);
    const bLo = binOf(20), bHi = binOf(140), mLo = binOf(140), mHi = binOf(2200), tLo = binOf(2200), tHi = binOf(13000), lHi = binOf(13000);
    const avgRange = (lo, hi) => { let s = 0; for (let i = lo; i <= hi; i++) s += view[i]; return s / ((hi - lo + 1) * 255); };
    let view = null;
    const dt = 1 / fps;
    const atk = 1 - Math.pow(.001, dt), rel = 1 - Math.pow(.03, dt);

    for (let fr = 0; fr < total; fr++) {
      const t = fr / fps;
      const start = Math.round(t * sr) - (FFT_N >> 1);
      for (let i = 0; i < FFT_N; i++) {
        const idx = start + i;
        let v = 0;
        if (idx >= 0 && idx < len) { for (let c = 0; c < chs; c++) v += chans[c][idx]; v /= chs; }
        re[i] = v * win[i]; im[i] = 0;
      }
      fft(re, im);
      const row = fr * BINS;
      for (let i = 0; i < BINS; i++) {
        const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / (FFT_N / 4);
        const db = 20 * Math.log10(mag + 1e-9);
        let v = ((db + 100) / 70) * 255; /* ≈ AnalyserNode min/max decibels */
        if (v < 0) v = 0; else if (v > 255) v = 255;
        v = prev[i] * .72 + v * .28;     /* smoothingTimeConstant */
        prev[i] = v;
        freq[row + i] = v;
      }
      view = freq.subarray(row, row + BINS);
      const rBass = avgRange(bLo, bHi), rMid = avgRange(mLo, mHi), rTre = avgRange(tLo, tHi), rLev = avgRange(bLo, lHi);
      sm.bass = rBass > sm.bass ? sm.bass + (rBass - sm.bass) * Math.min(1, atk * 1.4) : sm.bass + (rBass - sm.bass) * Math.min(1, rel * 1.2);
      sm.mid = rMid > sm.mid ? sm.mid + (rMid - sm.mid) * Math.min(1, atk * 1.4) : sm.mid + (rMid - sm.mid) * Math.min(1, rel * 1.2);
      sm.treble = rTre > sm.treble ? sm.treble + (rTre - sm.treble) * Math.min(1, atk * 1.4) : sm.treble + (rTre - sm.treble) * Math.min(1, rel * 1.2);
      sm.level = rLev > sm.level ? sm.level + (rLev - sm.level) * Math.min(1, atk * 1.4) : sm.level + (rLev - sm.level) * Math.min(1, rel * 1.2);
      bass[fr] = sm.bass; mid[fr] = sm.mid; treble[fr] = sm.treble; level[fr] = sm.level;
      hist.push(rBass); if (hist.length > 50) hist.shift();
      let h = 0; for (let i = 0; i < hist.length; i++) h += hist[i];
      const avg = h / hist.length;
      let b = fr > 0 ? beat[fr - 1] : 0;
      b *= Math.pow(0.0005, dt);
      if (rBass > avg * 1.32 && rBass > 0.1 && t - lastBeat > 0.16) { lastBeat = t; beatCount++; b = 1; }
      beat[fr] = b;
      if (onProgress && (fr & 63) === 0) { onProgress(fr / total); await Promise.resolve(); }
    }
    return { fps, total, duration, bins: BINS, freq, bass, mid, treble, level, beat, beatCount, buffer, sampleRate: sr };
  };

  /* ---------------- apply / restore onto the live engine ---------------- */
  OFF._orig = null;
  OFF._freqView = null;
  OFF._waveView = null;
  OFF.apply = (eng, tl, fr) => {
    if (!OFF._orig) OFF._orig = { freq: eng.freq, wave: eng.wave, bands: eng.bands, beat: eng.beat, beatCount: eng.beatCount, playing: eng.playing };
    fr = U.clamp(Math.round(fr), 0, tl.total - 1);
    if (!OFF._freqView || OFF._freqView.length !== tl.bins) OFF._freqView = new Uint8Array(tl.bins);
    OFF._freqView.set(tl.freq.subarray(fr * tl.bins, (fr + 1) * tl.bins));
    eng.freq = OFF._freqView;
    if (!OFF._waveView) OFF._waveView = new Float32Array(2048);
    OFF.waveAt(tl.buffer, fr / tl.fps, OFF._waveView);
    eng.wave = OFF._waveView;
    eng.bands = { bass: tl.bass[fr], mid: tl.mid[fr], treble: tl.treble[fr], level: tl.level[fr] };
    eng.beat = tl.beat[fr];
    eng.beatCount = tl.beatCount;
    eng.playing = true;
  };
  OFF.restore = (eng) => {
    const o = OFF._orig;
    if (!o) return;
    eng.freq = o.freq; eng.wave = o.wave; eng.bands = o.bands;
    eng.beat = o.beat; eng.beatCount = o.beatCount; eng.playing = o.playing;
    OFF._orig = null;
  };
  OFF.waveAt = (buffer, t, out) => {
    const sr = buffer.sampleRate || 44100;
    const ch = buffer.getChannelData(0);
    const start = Math.round(t * sr);
    for (let i = 0; i < out.length; i++) {
      const idx = start + i;
      out[i] = idx >= 0 && idx < ch.length ? ch[idx] : 0;
    }
    return out;
  };

  /* ---------------- exact-frame MP4/WebM export (mediabunny + WebCodecs) ---------------- */
  OFF.cancel = () => { OFF._cancelled = true; };

  OFF.exportMp4 = async (opts = {}) => {
    const VXp = VX.project, proj = VXp.current, eng = VX.audio.engine;
    if (OFF.active || VX.exporter.active) return;
    if (!window.VideoEncoder) { U.toast('This browser has no WebCodecs — use the real-time export instead', 'warn'); return; }
    let mb;
    try { mb = await import('mediabunny'); }
    catch (e) { U.toast('Offline export is available in the built/desktop app only', 'warn'); return; }

    const fps = opts.fps || proj.fps || 60;
    const duration = eng.duration || proj.duration || 30;
    const name = (proj.name || 'vlexyna').replace(/[^\w\- ]+/g, '');
    OFF.active = true; OFF._cancelled = false;
    VX.app.exporting = true;
    const badge = document.getElementById('exportBadge');
    if (badge) badge.style.display = '';
    const wasPlaying = VX.app.playing;
    VX.app.pause();
    const prog = (p, label) => VX.app.onExportProgress && VX.app.onExportProgress(U.clamp(p, 0, 1), label || '', duration);

    try {
      prog(0, 'Analyzing audio…');
      const tl = eng.buffer ? await OFF.precompute(eng.buffer, fps, p => prog(p * .25, 'Analyzing audio…')) : null;

      const c = document.createElement('canvas');
      c.width = proj.width; c.height = proj.height;

      /* codec chain: H.264/MP4 first, then VP9/WebM */
      const chains = [
        { format: () => new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), video: 'avc', audio: 'aac', ext: 'mp4', mime: 'video/mp4' },
        { format: () => new mb.WebMOutputFormat(), video: 'vp9', audio: 'opus', ext: 'webm', mime: 'video/webm' },
      ];
      let output = null, videoSource = null, audioSource = null, ext = 'mp4', mime = 'video/mp4';
      for (const ch of chains) {
        try {
          output = new mb.Output({ format: ch.format(), target: new mb.BufferTarget() });
          videoSource = new mb.CanvasSource(c, { codec: ch.video, quality: new mb.Quality(opts.bitrate || 16e6) });
          if (videoSource.canEncode && !(await videoSource.canEncode())) throw new Error(ch.video + ' not encodable');
          output.addVideoTrack(videoSource, { frameRate: fps });
          if (eng.buffer) {
            const a = new mb.AudioBufferSource({ codec: ch.audio, quality: new mb.Quality(192000) });
            if (!a.canEncode || (await a.canEncode())) { output.addAudioTrack(a); audioSource = a; }
          }
          ext = ch.ext; mime = ch.mime;
          break;
        } catch (e) { output = null; videoSource = null; audioSource = null; }
      }
      if (!output) throw new Error('No WebCodecs video encoder available — use the real-time export');

      await output.start();
      const total = Math.max(1, Math.floor(duration * fps));
      let cancelled = false;
      for (let i = 0; i < total; i++) {
        if (OFF._cancelled) { cancelled = true; break; }
        const t = i / fps;
        if (tl) OFF.apply(eng, tl, i);
        VX.renderer.render(c, t, { dt: 1 / fps, playing: true });
        await videoSource.add(t, 1 / fps);
        prog(.25 + .65 * (i / total), `Encoding frame ${i + 1} / ${total}`);
        if ((i & 15) === 0) await new Promise(r => setTimeout(r, 0));
      }
      if (!cancelled && audioSource && eng.buffer) {
        prog(.92, 'Encoding audio…');
        await audioSource.add(eng.buffer);
      }
      prog(.97, 'Finalizing…');
      await output.finalize();
      if (cancelled) { U.toast('Offline export cancelled'); return; }
      const blob = new Blob([output.target.buffer], { type: mime });
      U.download(blob, `${name || 'vlexyna'}_${proj.height}p.${ext}`);
      U.toast(`Offline ${ext.toUpperCase()} exported — ${U.fmtBytes(blob.size)}, every frame exact`);
    } catch (e) {
      U.toast('Offline export failed: ' + (e && e.message || e), 'err');
      if (window.console) console.warn('[vlexyna] offline export', e);
    } finally {
      OFF.restore(eng);
      OFF.active = false; OFF._cancelled = false;
      VX.app.exporting = false;
      if (badge) badge.style.display = 'none';
      if (wasPlaying) VX.app.play();
      VX.app.onExportProgress && VX.app.onExportProgress(1, '', duration);
      VX.ui && VX.ui.updateTransport && VX.ui.updateTransport();
    }
  };
})();
