/**
 * Offline audio analysis: the numbers that drive every visual.
 *
 * Decodes the track once, then computes per-frame (60 fps) features:
 *   - RMS loudness + slow envelope           → breathing, drop detection
 *   - 6 band energies (sub…air) + envelopes  → bass zoom, treble sparkle
 *   - 64-bin log spectrum                    → spectrum bars / ring
 *   - spectral-flux onset strength + hits    → camera shake, pulses
 *   - tempo + beat grid (autocorrelation)    → beat-locked motion
 *   - drop time (loudness step)              → the "everything kicks in" moment
 *
 * Everything is a plain Float32Array indexed by frame → the renderer is a pure
 * function of (t, features) → preview and export are pixel-identical.
 */

import { FFT, hannWindow } from './fft';

export interface Onset {
  t: number;
  strength: number; // 0..~3, relative to local flux statistics
}

export interface Beat {
  t: number;
  strength: number; // 0..1
  downbeat: boolean;
}

export interface AudioFeatures {
  duration: number;
  fps: number;
  frames: number;
  sampleRate: number;

  rms: Float32Array;        // per-frame loudness, ~0..1
  rmsSlow: Float32Array;    // 1 s smoothed — arrangement level
  zoomEnv: Float32Array;    // sub+bass envelope, fast attack / musical release
  breath: Float32Array;     // very slow energy (breathing zoom)
  bands: Float32Array[];    // [sub, bass, lowmid, mid, high, air], 0..1
  spectrum: Float32Array;   // frames × 64, log-spaced, 0..1
  flux: Float32Array;       // onset strength, normalized

  onsets: Onset[];
  beats: Beat[];
  bpm: number;
  bpmConfidence: number;
  dropTime: number | null;
}

export const BAND_EDGES_HZ: ReadonlyArray<readonly [number, number]> = [
  [20, 60],      // sub
  [60, 150],     // bass
  [150, 400],    // low mid
  [400, 2000],   // mid
  [2000, 6000],  // high
  [6000, 14000], // air
];

const SPEC_BINS = 64;
const SPEC_FMIN = 30;
const SPEC_FMAX = 15000;

export type ProgressFn = (fraction: number, label: string) => void;

interface AnalysisInput {
  /** Mono mixdown, any sample rate. */
  samples: Float32Array;
  sampleRate: number;
  duration: number;
}

export async function analyzeAudio(buf: AudioBuffer, onProgress?: ProgressFn): Promise<AudioFeatures> {
  const samples = mixToMono(buf);
  return analyzeSamples({ samples, sampleRate: buf.sampleRate, duration: buf.duration }, onProgress);
}

export function mixToMono(buf: AudioBuffer): Float32Array {
  const n = buf.length;
  if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
  const out = new Float32Array(n);
  const inv = 1 / buf.numberOfChannels;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] * inv;
  }
  return out;
}

export async function analyzeAudioData(
  data: Float32Array,
  sampleRate: number,
  duration: number,
  onProgress?: ProgressFn,
): Promise<AudioFeatures> {
  return analyzeSamples({ samples: data, sampleRate, duration }, onProgress);
}

// ---------------------------------------------------------------------------
// core
// ---------------------------------------------------------------------------

async function analyzeSamples(
  { samples, sampleRate, duration }: AnalysisInput,
  onProgress?: ProgressFn,
): Promise<AudioFeatures> {
  const fps = 60;
  const winSize = 2048;
  const hop = Math.max(1, Math.round(sampleRate / fps));
  const frames = Math.max(1, Math.floor((samples.length - winSize) / hop) + 1);
  const fft = new FFT(winSize);
  const window = hannWindow(winSize);
  const nBins = winSize / 2;
  const binHz = sampleRate / winSize;

  const rms = new Float32Array(frames);
  const mags = new Float32Array(frames * nBins); // |X| per frame — 145 s ≈ 29 MB, fine
  const re = new Float32Array(winSize);
  const im = new Float32Array(winSize);

  const yieldEvery = 400;
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    let acc = 0;
    for (let i = 0; i < winSize; i++) {
      const s = off + i < samples.length ? samples[off + i] : 0;
      acc += s * s;
      re[i] = s * window[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(acc / winSize);
    fft.transform(re, im);
    const base = f * nBins;
    for (let b = 0; b < nBins; b++) {
      mags[base + b] = Math.hypot(re[b], im[b]);
    }
    if (onProgress && f % yieldEvery === 0) {
      onProgress(0.05 + 0.6 * (f / frames), 'Reading the spectrum');
      await tick();
    }
  }

  onProgress?.(0.68, 'Balancing bands');
  await tick();

  // --- band energies + log spectrum ---------------------------------------
  const bandIdx: Array<[number, number]> = BAND_EDGES_HZ.map(([lo, hi]) => [
    Math.max(1, Math.round(lo / binHz)),
    Math.min(nBins - 1, Math.round(hi / binHz)),
  ]);
  const bands = bandIdx.map(() => new Float32Array(frames));

  const specLo = SPEC_FMIN;
  const specHi = Math.min(SPEC_FMAX, sampleRate / 2 - 100);
  const specEdge = new Float32Array(SPEC_BINS + 1);
  for (let b = 0; b <= SPEC_BINS; b++) {
    specEdge[b] = specLo * Math.pow(specHi / specLo, b / SPEC_BINS);
  }
  const specIdx: Array<[number, number]> = [];
  for (let b = 0; b < SPEC_BINS; b++) {
    specIdx.push([
      Math.max(1, Math.floor(specEdge[b] / binHz)),
      Math.max(2, Math.ceil(specEdge[b + 1] / binHz)),
    ]);
  }
  const spectrum = new Float32Array(frames * SPEC_BINS);

  for (let f = 0; f < frames; f++) {
    const base = f * nBins;
    for (let bi = 0; bi < bandIdx.length; bi++) {
      const [i0, i1] = bandIdx[bi];
      let s = 0;
      for (let b = i0; b <= i1; b++) s += mags[base + b];
      bands[bi][f] = s / Math.max(1, i1 - i0 + 1);
    }
    const sbase = f * SPEC_BINS;
    for (let b = 0; b < SPEC_BINS; b++) {
      const [i0, i1] = specIdx[b];
      let m = 0;
      for (let k = i0; k < Math.min(i1, nBins); k++) m = Math.max(m, mags[base + k]);
      spectrum[sbase + b] = m;
    }
  }

  // normalize each band / spectrum column by its 95th percentile (adaptive EQ)
  for (let bi = 0; bi < bands.length; bi++) normalizePctl(bands[bi], 0.95, 1);
  for (let b = 0; b < SPEC_BINS; b++) {
    const col = new Float32Array(frames);
    for (let f = 0; f < frames; f++) col[f] = spectrum[f * SPEC_BINS + b];
    normalizePctl(col, 0.97, 1);
    for (let f = 0; f < frames; f++) spectrum[f * SPEC_BINS + b] = col[f];
  }
  normalizePctl(rms, 0.97, 1);

  // --- envelopes ------------------------------------------------------------
  const bassish = new Float32Array(frames);
  for (let f = 0; f < frames; f++) bassish[f] = Math.max(bands[0][f], bands[1][f]);
  const zoomEnv = envelope(bassish, fps, 0.015, 0.22); // fast attack, musical release
  const rmsSlow = boxcar(rms, Math.round(fps * 1.0));
  const breath = boxcar(rms, Math.round(fps * 4.0));

  // --- spectral flux (onset strength) ---------------------------------------
  onProgress?.(0.78, 'Finding the hits');
  await tick();
  const fluxRaw = new Float32Array(frames);
  const NB = SPEC_BINS;
  for (let f = 1; f < frames; f++) {
    let s = 0;
    const a = (f - 1) * NB;
    const b = f * NB;
    for (let k = 0; k < NB; k++) {
      const d = spectrum[b + k] - spectrum[a + k];
      if (d > 0) s += d;
    }
    fluxRaw[f] = s;
  }
  // remove local mean (moving average over ±0.35 s), keep the positive part
  const flux = rectify(subtractMean(fluxRaw, Math.round(fps * 0.35)));
  normalizePctl(flux, 0.98, 1);

  const onsets = pickOnsets(flux, fps);

  // --- tempo ---------------------------------------------------------------
  onProgress?.(0.88, 'Locking the tempo');
  await tick();
  const { bpm, confidence, period } = estimateTempo(flux, fps);
  const beats = confidence > 0.25 ? buildBeatGrid(flux, fps, period) : [];

  // --- drop time -------------------------------------------------------------
  const dropTime = findDropTime(rmsSlow, fps, duration);

  onProgress?.(1, 'Done');

  return {
    duration,
    fps,
    frames,
    sampleRate,
    rms,
    rmsSlow,
    zoomEnv,
    breath,
    bands,
    spectrum,
    flux,
    onsets,
    beats,
    bpm,
    bpmConfidence: confidence,
    dropTime,
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function percentile(src: Float32Array, p: number): number {
  const a = Array.from(src).sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * a.length)))] ?? 0;
}

/** Scale in place so the p-th percentile maps to `target` (soft-clamped to 1). */
function normalizePctl(x: Float32Array, p: number, target: number): void {
  const v = percentile(x, p);
  if (v <= 1e-9) {
    x.fill(0);
    return;
  }
  const k = target / v;
  for (let i = 0; i < x.length; i++) x[i] = Math.min(1, x[i] * k);
}

function boxcar(x: Float32Array, w: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  const r = Math.max(1, Math.round(w / 2));
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += x[i];
    if (i >= 2 * r + 1) acc -= x[i - (2 * r + 1)];
    out[i] = acc / Math.min(i + 1, 2 * r + 1);
  }
  return out;
}

function subtractMean(x: Float32Array, w: number): Float32Array {
  const mean = boxcar(x, w);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] - mean[i];
  return out;
}

function rectify(x: Float32Array): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.max(0, x[i]);
  return out;
}

/** Asymmetric one-pole envelope follower: quick to rise, slow to fall. */
export function envelope(x: Float32Array, fps: number, attackS: number, releaseS: number): Float32Array {
  const a = Math.exp(-1 / Math.max(1e-4, attackS * fps));
  const r = Math.exp(-1 / Math.max(1e-4, releaseS * fps));
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const c = x[i] > y ? a : r;
    y = c * y + (1 - c) * x[i];
    out[i] = y;
  }
  return out;
}

/** Adaptive-threshold peak picking. Returns hits with relative strength. */
export function pickOnsets(flux: Float32Array, fps: number): Onset[] {
  const n = flux.length;
  if (n === 0) return [];
  const w = Math.round(fps * 0.15);
  const minGap = Math.round(fps * 0.09);
  const global = percentile(flux, 0.98) || 1;

  const out: Onset[] = [];
  let last = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    const v = flux[i];
    if (v < flux[i - 1] || v < flux[i + 1]) continue;
    // local stats
    let mean = 0;
    let cnt = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++, cnt++) mean += flux[j];
    mean /= Math.max(1, cnt);
    let variance = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) variance += (flux[j] - mean) ** 2;
    const std = Math.sqrt(variance / Math.max(1, cnt)) || 1e-6;
    const thr = mean + 1.1 * std;
    if (v < thr || v < 0.06 * global) continue;
    if (i - last < minGap) {
      // keep the stronger of two close hits
      const prev = out[out.length - 1];
      if (prev && v / std > prev.strength) {
        prev.t = i / fps;
        prev.strength = v / std;
        last = i;
      }
      continue;
    }
    out.push({ t: i / fps, strength: v / std });
    last = i;
  }
  for (const o of out) o.strength = Math.min(3, o.strength) / 3;
  return out;
}

export interface TempoEstimate {
  bpm: number;
  confidence: number;
  period: number; // in frames
}

/** Autocorrelation of the flux envelope over 60–200 BPM, tempo-prior weighted. */
export function estimateTempo(flux: Float32Array, fps: number): TempoEstimate {
  const n = flux.length;
  if (n < fps * 4) return { bpm: 0, confidence: 0, period: 0 };

  const minLag = Math.max(2, Math.floor((60 / 200) * fps));
  const maxLag = Math.min(n - 2, Math.ceil((60 / 60) * fps));
  const scores = new Float64Array(maxLag + 1);
  let sum = 0;
  for (let L = minLag; L <= maxLag; L++) {
    let acc = 0;
    for (let i = 0; i + L < n; i++) acc += flux[i] * flux[i + L];
    scores[L] = acc / (n - L);
    sum += scores[L];
  }
  const meanScore = sum / Math.max(1, maxLag + 1 - minLag);

  let best = minLag;
  let bestScore = -Infinity;
  for (let L = minLag; L <= maxLag; L++) {
    const bpm = (60 * fps) / L;
    // prior: prefer 90–180, centered 125
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 125) / 0.55) ** 2);
    const s = scores[L] * prior;
    if (s > bestScore) {
      bestScore = s;
      best = L;
    }
  }
  // parabolic refinement — integer lags quantize 126 BPM to 124 (0.5 frame ≈ 1.75%)
  const y0 = scores[best - 1] ?? scores[best];
  const y1 = scores[best];
  const y2 = scores[best + 1] ?? scores[best];
  const denom = y0 - 2 * y1 + y2;
  let lag = best;
  if (denom < 0) lag = best + (0.5 * (y0 - y2)) / denom;
  lag = Math.max(minLag, Math.min(maxLag, lag));

  const bpmRaw = (60 * fps) / lag;
  // fold into 84–168
  let bpm = bpmRaw;
  while (bpm < 84) bpm *= 2;
  while (bpm > 168) bpm /= 2;
  const period = (60 * fps) / bpm;
  const confidence = meanScore > 0 ? Math.min(1, scores[best] / meanScore / 8) : 0;
  return { bpm: Math.round(bpm * 10) / 10, confidence, period };
}

/** Comb-align the flux to find the phase, then emit the beat grid. */
function buildBeatGrid(flux: Float32Array, fps: number, period: number): Beat[] {
  const n = flux.length;
  const steps = 96;
  let bestOffset = 0;
  let bestScore = -Infinity;
  for (let s = 0; s < steps; s++) {
    const off = (s / steps) * period;
    let acc = 0;
    for (let k = 0; ; k++) {
      const idx = Math.round(off + k * period);
      if (idx >= n) break;
      acc += flux[idx] + 0.5 * (flux[Math.max(0, idx - 1)] + flux[Math.min(n - 1, idx + 1)]);
    }
    if (acc > bestScore) {
      bestScore = acc;
      bestOffset = off;
    }
  }
  // snap to the strongest nearby onset so beat 0 lands on a real hit
  const tol = Math.max(1, Math.round(period * 0.12));
  let snapped = bestOffset;
  let snapBest = -1;
  for (let idx = Math.round(bestOffset); idx < Math.round(bestOffset) + tol && idx < n; idx++) {
    if (flux[idx] > snapBest) {
      snapBest = flux[idx];
      snapped = idx;
    }
  }

  const beats: Beat[] = [];
  const maxFlux = Math.max(...Array.from(flux), 1e-6);
  const strengthTol = 2; // frames of tolerance when reading a beat's strength
  for (let k = 0; ; k++) {
    const idx = Math.round(snapped + k * period);
    if (idx >= n) break;
    let f = 0;
    for (let j = Math.max(0, idx - strengthTol); j <= Math.min(n - 1, idx + strengthTol); j++) f = Math.max(f, flux[j]);
    const strength = Math.min(1, f / maxFlux);
    beats.push({ t: idx / fps, strength, downbeat: k % 4 === 0 });
  }
  return beats;
}

/** First sustained loudness step: the moment the track "arrives". */
export function findDropTime(rmsSlow: Float32Array, fps: number, duration: number): number | null {
  const n = rmsSlow.length;
  if (n < fps * 5) return null;
  const peak = Math.max(...Array.from(rmsSlow));
  const thr = 0.55 * peak;
  const hold = Math.round(fps * 0.8);
  let run = 0;
  for (let i = 0; i < n; i++) {
    if (rmsSlow[i] >= thr) {
      run++;
      if (run >= hold) {
        const t = (i - run + 1) / fps;
        if (t >= 3 && t <= duration - 5) return t;
        return null;
      }
    } else {
      run = 0;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// feature lookup for the renderer
// ---------------------------------------------------------------------------

export function sampleAt(arr: Float32Array, fps: number, t: number): number {
  const x = t * fps;
  const i = Math.floor(x);
  if (i < 0) return arr[0] ?? 0;
  if (i >= arr.length - 1) return arr[arr.length - 1] ?? 0;
  const a = arr[i];
  const b = arr[i + 1];
  if (a === undefined || b === undefined) return 0;
  return a + (b - a) * (x - i);
}

export function spectrumAt(F: AudioFeatures, t: number, out: Float32Array): void {
  const x = t * F.fps;
  const i = Math.floor(x);
  const j = Math.min(F.frames - 1, i + 1);
  const mix = x - i;
  const NB = 64;
  for (let b = 0; b < NB; b++) {
    const a = F.spectrum[Math.max(0, Math.min(F.frames - 1, i)) * NB + b] ?? 0;
    const c = F.spectrum[j * NB + b] ?? 0;
    out[b] = a + (c - a) * mix;
  }
}
