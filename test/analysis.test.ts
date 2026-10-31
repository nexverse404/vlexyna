/**
 * Analysis pipeline test (node, no browser): synthesize a 126 BPM track with a
 * 4-second quiet intro and a bass drop, run the full feature extraction, and
 * assert the numbers come back sane.
 */

import { analyzeAudioData, estimateTempo, pickOnsets, findDropTime, envelope, sampleAt } from '../src/engine/analysis';
import { FFT } from '../src/engine/fft';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name} ${detail}`);
  }
}

// --- FFT sanity: a sine lands in the right bin ------------------------------
{
  const n = 1024;
  const fft = new FFT(n);
  const bin = 37;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * bin * i) / n);
  fft.transform(re, im);
  let best = 0;
  let bestMag = -1;
  for (let k = 0; k < n / 2; k++) {
    const m = Math.hypot(re[k], im[k]);
    if (m > bestMag) {
      bestMag = m;
      best = k;
    }
  }
  check('FFT peaks in the right bin', best === bin, `got ${best}`);
}

// --- envelope follower -------------------------------------------------------
{
  const fps = 60;
  const x = new Float32Array(600);
  // a 5-frame plateau (a real kick spans ~12 frames at this fps)
  for (let i = 100; i < 105; i++) x[i] = 1;
  const env = envelope(x, fps, 0.02, 0.3);
  check('envelope: attack is fast', env[104] > 0.9, `env@104=${env[104]}`);
  // release 0.3 s → after 10 frames (0.167 s) expect ~exp(-0.167/0.3) ≈ 0.57
  const releaseRatio = env[115] / (env[104] || 1);
  check('envelope: release is slow', releaseRatio > 0.35 && releaseRatio < 0.9, `ratio=${releaseRatio}`);
}

// --- synthetic track ---------------------------------------------------------
const sr = 44100;
const bpm = 126;
const beat = 60 / bpm;
const intro = 4;
const duration = 30;
const n = Math.floor(duration * sr);
const x = new Float32Array(n);

// quiet pad through the intro
for (let i = 0; i < n; i++) {
  const t = i / sr;
  if (t < intro) x[i] += 0.05 * Math.sin(2 * Math.PI * 220 * t) * Math.min(1, t / 0.5);
}

// four-on-the-floor kicks + a bass hum after the intro
let kicks = 0;
for (let b = Math.ceil(intro / beat); b * beat < duration - 0.5; b++) {
  const tb = b * beat;
  const i0 = Math.floor(tb * sr);
  const len = Math.floor(0.30 * sr);
  for (let j = 0; j < len && i0 + j < n; j++) {
    const tt = j / sr;
    const f = 45 + 110 * Math.exp(-tt / 0.02);
    x[i0 + j] += 0.9 * Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt / 0.09);
  }
  kicks++;
}
for (let i = Math.floor(intro * sr); i < n; i++) {
  const t = i / sr;
  x[i] += 0.22 * Math.sin(2 * Math.PI * 55 * t);
}

console.log(`synth: ${kicks} kicks, ${bpm} BPM, drop at ${intro}s`);

const F = await analyzeAudioData(x, sr, duration);

check('bpm detected ≈ 126', Math.abs(F.bpm - 126) < 3, `got ${F.bpm}`);
check('bpm confidence decent', F.bpmConfidence > 0.25, `got ${F.bpmConfidence}`);
// the grid covers the whole track by design; quiet-intro beats carry ~0 strength
const expectedBeats = Math.floor(duration / beat);
check('beat grid covers the track', Math.abs(F.beats.length - expectedBeats) <= 3, `got ${F.beats.length} vs ~${expectedBeats}`);
check(
  'intro beats are weak, drop beats are strong',
  (() => {
    const quiet = F.beats.filter((b) => b.t < intro - 0.5);
    const loud = F.beats.filter((b) => b.t > intro + 1);
    const qAvg = quiet.reduce((a, b) => a + b.strength, 0) / Math.max(1, quiet.length);
    const lAvg = loud.reduce((a, b) => a + b.strength, 0) / Math.max(1, loud.length);
    return lAvg > qAvg + 0.2;
  })(),
);
check(
  'beat period ≈ 0.476s',
  F.beats.length > 2 && Math.abs(F.beats[1].t - F.beats[0].t - beat) < 0.02,
  `got ${F.beats[1] && F.beats[1].t - F.beats[0].t}`,
);
check('onsets ≈ kick count', Math.abs(F.onsets.length - kicks) <= 3, `got ${F.onsets.length}`);
check('first onset is after the intro', F.onsets[0] && F.onsets[0].t >= intro - 0.2, `got ${F.onsets[0]?.t}`);
check('drop time ≈ 4s', F.dropTime != null && Math.abs(F.dropTime - intro) < 2, `got ${F.dropTime}`);

// envelopes react to the drop
const zoomBefore = sampleAt(F.zoomEnv, F.fps, 1.5);
const zoomAfter = sampleAt(F.zoomEnv, F.fps, 6.0);
check('zoomEnv rises after the drop', zoomAfter > zoomBefore + 0.15, `${zoomBefore} → ${zoomAfter}`);

// spectrum has content in the low end during the drop (window-max: point
// samples can land in the gap between kicks)
const subMax = Math.max(...Array.from({ length: 90 }, (_, i) => sampleAt(F.bands[0], F.fps, 5.5 + i / 60)));
const bassMax = Math.max(...Array.from({ length: 90 }, (_, i) => sampleAt(F.bands[1], F.fps, 5.5 + i / 60)));
check('sub band active after drop', subMax > 0.4, `got ${subMax}`);
check('bass band active after drop', bassMax > 0.2, `got ${bassMax}`);

// quiet part stays quiet
const rmsBefore = sampleAt(F.rms, F.fps, 1.5);
const rmsAfter = sampleAt(F.rms, F.fps, 6.0);
check('rms jumps at the drop', rmsAfter > rmsBefore * 2, `${rmsBefore} → ${rmsAfter}`);

// --- isolated helpers --------------------------------------------------------
{
  const fps = 60;
  const flux = new Float32Array(fps * 5);
  // hits every 0.5 s = 120 bpm; start at frame 10 (frame 0 has no predecessor)
  for (let k = 0; k < 5; k++) flux[10 + Math.floor(k * fps * 0.5)] = 1.0;
  const tempo = estimateTempo(flux, fps);
  check('estimateTempo on metronome', Math.abs(tempo.bpm - 120) < 4, `got ${tempo.bpm}`);
  const onsets = pickOnsets(flux, fps);
  check('pickOnsets on metronome', onsets.length === 5, `got ${onsets.length}`);
  // step at t=4 s (drops before 3 s are treated as the track just starting)
  const level = new Float32Array(fps * 10);
  for (let i = fps * 4; i < level.length; i++) level[i] = 1;
  const drop = findDropTime(level, fps, 10);
  check('findDropTime on a step', drop != null && Math.abs(drop - 4) < 1, `got ${drop}`);
}

console.log(failures === 0 ? '\nall green' : `\n${failures} failure(s)`);
process.exitCode = failures === 0 ? 0 : 1;
