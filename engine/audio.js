/* Vlexyna — audio.js — playback, analysis, beat detection, mic, demo track synth */
'use strict';
import { VX, U } from './util.js';
(() => {
  const A = VX.audio = {};

  class AudioEngine {
    constructor() {
      this.ctx = null; this.buffer = null; this.src = null;
      this.playing = false; this.offset = 0; this.startTime = 0;
      this.loop = true; this.volume = 0.9;
      this.duration = 0; this.name = ''; this.isDemo = false;
      this.freq = new Uint8Array(1024); this.wave = new Float32Array(2048);
      this.bands = { bass: 0, mid: 0, treble: 0, level: 0 };
      this.raw = { bass: 0, mid: 0, treble: 0, level: 0 };
      this.beat = 0; this.beatCount = 0; this._lastBeat = -9; this._hist = [];
      this.peaks = null; this.mic = null; this.micStream = null;
      this.onstate = null; this.onended = null;
    }
    ensureCtx() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = 0.72;
      this.gain = this.ctx.createGain(); this.gain.gain.value = this.volume;
      this.analyser.connect(this.gain); this.gain.connect(this.ctx.destination);
      this.recDest = this.ctx.createMediaStreamAudioDestination();
      this.analyser.connect(this.recDest);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.wave = new Float32Array(this.analyser.fftSize);
      return this.ctx;
    }
    async resume() { this.ensureCtx(); if (this.ctx.state === 'suspended') await this.ctx.resume(); }

    async loadArrayBuffer(ab, name) {
      this.ensureCtx();
      const buf = await this.ctx.decodeAudioData(ab);
      this.setBuffer(buf, name || 'audio', false);
      return buf;
    }
    async loadFile(file) {
      const ab = await file.arrayBuffer();
      return this.loadArrayBuffer(ab, file.name);
    }
    setBuffer(buf, name, isDemo) {
      this.pause();
      this.buffer = buf; this.duration = buf.duration; this.name = name; this.isDemo = !!isDemo;
      this.offset = 0; this.peaks = this.computePeaks(buf, 1400);
      if (this.onstate) this.onstate();
    }

    /* ---- synthesized demo track (no external files needed) ---- */
    async loadDemo() {
      this.ensureCtx();
      if (this._demoBuf) { this.setBuffer(this._demoBuf, 'Vlexyna Demo Beat', true); this.seek(0); return; }
      const sr = 44100, bars = 12, bpm = 100, beat = 60 / bpm, dur = bars * 4 * beat + 1;
      const oc = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
      const master = oc.createGain(); master.gain.value = 0.9;
      const comp = oc.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5;
      master.connect(comp); comp.connect(oc.destination);
      const rev = oc.createConvolver(); const revLen = sr * 1.4;
      const ir = oc.createBuffer(2, revLen, sr);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < revLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / revLen, 2.6) * .5; }
      rev.buffer = ir; const revG = oc.createGain(); revG.gain.value = .32; rev.connect(revG); revG.connect(master);
      const N = (f) => f * 2 ** (Math.floor(Math.random() * 0) / 12);
      const kick = (t) => {
        const o = oc.createOscillator(), g = oc.createGain();
        o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(44, t + .11);
        g.gain.setValueAtTime(1.05, t); g.gain.exponentialRampToValueAtTime(.001, t + .32);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + .34);
        const c = oc.createOscillator(), cg = oc.createGain();
        c.frequency.value = 1100; cg.gain.setValueAtTime(.25, t); cg.gain.exponentialRampToValueAtTime(.001, t + .02);
        c.connect(cg); cg.connect(master); c.start(t); c.stop(t + .03);
      };
      const snare = (t, v = 1) => {
        const len = .2, b = oc.createBuffer(1, sr * len, sr), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
        const s = oc.createBufferSource(); s.buffer = b;
        const f = oc.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = .8;
        const g = oc.createGain(); g.gain.value = .55 * v;
        s.connect(f); f.connect(g); g.connect(master); g.connect(rev); s.start(t);
        const o = oc.createOscillator(), og = oc.createGain(); o.frequency.value = 190;
        og.gain.setValueAtTime(.28 * v, t); og.gain.exponentialRampToValueAtTime(.001, t + .09);
        o.connect(og); og.connect(master); o.start(t); o.stop(t + .1);
      };
      const hat = (t, open = false, v = 1) => {
        const len = open ? .3 : .06, b = oc.createBuffer(1, sr * len, sr), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, open ? 1.4 : 4);
        const s = oc.createBufferSource(); s.buffer = b;
        const f = oc.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
        const g = oc.createGain(); g.gain.value = .3 * v;
        s.connect(f); f.connect(g); g.connect(master); s.start(t);
      };
      const bassN = (t, d, fq) => {
        const o = oc.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fq;
        const o2 = oc.createOscillator(); o2.type = 'square'; o2.frequency.value = fq / 2;
        const f = oc.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(120, t + d); f.Q.value = 4;
        const g = oc.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.5, t + .01); g.gain.setValueAtTime(.5, t + d * .7); g.gain.linearRampToValueAtTime(0, t + d);
        o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + d); o2.start(t); o2.stop(t + d);
      };
      const pad = (t, d, fqs, v = 1) => {
        for (const fq of fqs) for (const det of [-6, 6]) {
          const o = oc.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fq * 2 ** (det / 1200);
          const f = oc.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1400, t + d * .6); f.frequency.linearRampToValueAtTime(500, t + d);
          const g = oc.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05 * v, t + .06); g.gain.setValueAtTime(.05 * v, t + d * .8); g.gain.linearRampToValueAtTime(0, t + d);
          o.connect(f); f.connect(g); g.connect(master); g.connect(rev); o.start(t); o.stop(t + d + .05);
        }
      };
      const pluck = (t, fq, v = 1) => {
        const o = oc.createOscillator(); o.type = 'triangle'; o.frequency.value = fq;
        const g = oc.createGain(); g.gain.setValueAtTime(.24 * v, t); g.gain.exponentialRampToValueAtTime(.001, t + .38);
        o.connect(g); g.connect(master); g.connect(rev); o.start(t); o.stop(t + .4);
      };
      const riser = (t, d) => {
        const b = oc.createBuffer(1, sr * d, sr), dd = b.getChannelData(0);
        for (let i = 0; i < dd.length; i++) dd[i] = (Math.random() * 2 - 1);
        const s = oc.createBufferSource(); s.buffer = b;
        const f = oc.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
        f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + d);
        const g = oc.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.3, t + d); g.gain.linearRampToValueAtTime(0, t + d + .05);
        s.connect(f); f.connect(g); g.connect(master); g.connect(rev); s.start(t);
      };
      /* chord progression Am F C G (A minor) */
      const prog = [[220, 261.63, 329.63], [174.61, 220, 261.63], [130.81, 196, 261.63], [196, 246.94, 293.66]];
      const bassNotes = [110, 87.31, 65.41, 98];
      const pent = [440, 523.25, 587.33, 659.25, 783.99, 880];
      for (let bar = 0; bar < bars; bar++) {
        const t0 = bar * 4 * beat, ch = prog[bar % 4];
        const section = Math.floor(bar / 4); /* 0 intro, 1 drop, 2 outro */
        pad(t0, 4 * beat, ch.map(f => f / 2), section === 1 ? 1 : .8);
        if (section >= 1) { kick(t0); kick(t0 + beat * 2); if (section === 1) { kick(t0 + beat * 3 + beat / 2); } }
        if (section >= 1 && bar % 1 === 0) { snare(t0 + beat, 1); snare(t0 + beat * 3, 1); }
        for (let i = 0; i < 8; i++) hat(t0 + i * beat / 2, i % 4 === 3 && section === 1, i % 2 ? .5 : 1);
        if (section >= 1) { bassN(t0, beat * .45, bassNotes[bar % 4]); bassN(t0 + beat, beat * .45, bassNotes[bar % 4]); bassN(t0 + beat * 2, beat * .45, bassNotes[bar % 4] * (bar % 2 ? 1.5 : 1)); bassN(t0 + beat * 3, beat * .45, bassNotes[bar % 4]); }
        if (section === 0 || section === 2) for (let i = 0; i < 6; i++) pluck(t0 + i * beat * .66 + (i % 2) * .05, pent[(bar * 3 + i * 2) % pent.length] / 2, .8);
        if (section === 1) for (let i = 0; i < 4; i++) pluck(t0 + i * beat + beat / 2, pent[(bar * 2 + i * 3) % pent.length], .6);
        if (bar % 4 === 3) riser(t0 + 2 * beat, 2 * beat);
      }
      const buf = await oc.startRendering();
      this._demoBuf = buf;
      this.setBuffer(buf, 'Vlexyna Demo Beat', true);
      this.seek(0);
      return buf;
    }

    computePeaks(buf, n) {
      const ch = buf.getChannelData(0), ch2 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
      const out = new Float32Array(n), step = Math.max(1, Math.floor(ch.length / n));
      for (let i = 0; i < n; i++) {
        let m = 0; const s = i * step, e = Math.min(ch.length, s + step);
        for (let j = s; j < e; j += 3) { const v = Math.abs(ch[j]) + (ch2 ? Math.abs(ch2[j]) * .5 : 0); if (v > m) m = v; }
        out[i] = Math.min(1, m);
      }
      return out;
    }

    play() {
      if (!this.buffer) return;
      this.ensureCtx();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (this.playing) return;
      this.src = this.ctx.createBufferSource();
      this.src.buffer = this.buffer; this.src.loop = this.loop;
      this.src.connect(this.analyser);
      if (this.offset >= this.duration - .01) this.offset = 0;
      this.startTime = this.ctx.currentTime;
      this.src.start(0, this.offset);
      this.playing = true;
      this.src.onended = () => { if (this.src && this.src.loop) return; if (this.playing) { this.playing = false; this.offset = this.duration; if (this.onstate) this.onstate(); if (this.onended) this.onended(); } };
      if (this.onstate) this.onstate();
    }
    pause() {
      if (!this.playing) { if (this.onstate) this.onstate(); return; }
      this.offset = this.time;
      if (this.src) { try { this.src.onended = null; this.src.stop(); } catch (e) { } this.src = null; }
      this.playing = false;
      if (this.onstate) this.onstate();
    }
    toggle() { this.playing ? this.pause() : this.play(); }
    seek(t) {
      t = U.clamp(t, 0, Math.max(0, this.duration - .001));
      if (this.playing) { this.pause(); this.offset = t; this.play(); } else this.offset = t;
    }
    get time() {
      if (!this.playing || !this.buffer) return this.offset;
      let t = this.ctx.currentTime - this.startTime;
      if (this.loop && this.duration > 0) t = t % this.duration;
      return U.clamp(t, 0, this.duration);
    }
    setVolume(v) { this.volume = v; if (this.gain) this.gain.gain.value = v; }
    setLoop(b) { this.loop = b; if (this.src) this.src.loop = b; }

    async enableMic() {
      this.ensureCtx();
      if (this.mic) return true;
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
        this.mic = this.ctx.createMediaStreamSource(this.micStream);
        this.mic.connect(this.analyser);
        return true;
      } catch (e) { U.toast('Microphone access denied', 'err'); return false; }
    }
    disableMic() {
      if (!this.mic) return;
      try { this.mic.disconnect(); } catch (e) { }
      this.micStream.getTracks().forEach(t => t.stop());
      this.mic = null; this.micStream = null;
    }

    binOf(freq) { return Math.round(freq * this.analyser.fftSize / this.ctx.sampleRate); }
    /* average magnitude in freq range → 0..1 */
    range(f0, f1) {
      if (!this.analyser) return 0;
      const a = U.clamp(this.binOf(f0), 0, this.freq.length - 1), b = U.clamp(this.binOf(f1), a + 1, this.freq.length);
      let s = 0; for (let i = a; i < b; i++) s += this.freq[i];
      return s / (b - a) / 255;
    }
    tick(dt) {
      const has = this.analyser && (this.playing || this.mic);
      if (has) { this.analyser.getByteFrequencyData(this.freq); this.analyser.getFloatTimeDomainData(this.wave); }
      else { this.freq.fill(0); this.wave.fill(0); }
      const r = this.raw;
      if (has) {
        r.bass = this.range(20, 140); r.mid = this.range(140, 2200); r.treble = this.range(2200, 13000); r.level = this.range(20, 13000);
      } else { r.bass *= .92; r.mid *= .92; r.treble *= .92; r.level *= .92; }
      const atk = 1 - Math.pow(.001, dt), rel = 1 - Math.pow(.03, dt);
      for (const k of ['bass', 'mid', 'treble', 'level']) {
        const cur = this.bands[k], target = r[k];
        this.bands[k] = target > cur ? cur + (target - cur) * Math.min(1, atk * 1.4) : cur + (target - cur) * Math.min(1, rel * 1.2);
      }
      /* beat detection on bass energy */
      if (has) {
        this._hist.push(r.bass); if (this._hist.length > 50) this._hist.shift();
        const avg = this._hist.reduce((a, b) => a + b, 0) / this._hist.length;
        const t = this.ctx.currentTime;
        if (r.bass > avg * 1.32 && r.bass > 0.1 && t - this._lastBeat > 0.16) { this._lastBeat = t; this.beatCount++; this.beat = 1; }
      }
      this.beat *= Math.pow(0.0005, dt);
    }
  }
  A.AudioEngine = AudioEngine;
  A.engine = new AudioEngine();
})();
