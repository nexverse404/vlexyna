#!/usr/bin/env python3
"""Synthesizes the Vlexyna demo track: 30 s at 126 BPM in A# minor —
a quiet pad intro, a clear drop at ~3.8 s, four-on-the-floor kicks,
sidechained sub bass and hats, and a short outro. Deliberately matches the
profile of the reference track (sub/bass dominant, 126 BPM) so the demo
shows off exactly what the analyzer + renderer do best.

Run:  python3 tools/make-demo-track.py
Out:  public/demo/fantasize-demo.mp3
"""

import numpy as np
import wave
import subprocess
import sys
from pathlib import Path

SR = 44100
BPM = 126.0
BEAT = 60.0 / BPM
INTRO_BEATS = 8          # drop lands on beat 8 (~3.81 s)
TOTAL_BEATS = 62         # ~29.5 s
OUTRO_BEATS = 4          # last beats: no drums, pad rings out

# A# minor: i – v – bVI – bVII, two bars each
Bbm = dict(root=58.27, chord=[116.54, 138.59, 174.61])   # A#1 / A#2 C#3 F3
Fm = dict(root=43.65, chord=[87.31, 103.83, 130.81])     # F1  / F2 Ab2 C3
Gb = dict(root=46.25, chord=[92.50, 116.54, 138.59])     # Gb1 / Gb2 Bb2 Db3
Abm = dict(root=51.91, chord=[103.83, 123.47, 155.56])   # Ab1 / Ab2 B2 Eb3
PROGRESSION = [Bbm, Bbm, Fm, Fm, Gb, Gb, Abm, Abm, Bbm, Bbm, Fm, Fm, Gb, Abm]


def beats2sec(b):
    return b * BEAT


def main():
    total = beats2sec(TOTAL_BEATS + OUTRO_BEATS) + 1.2
    n = int(total * SR)
    t = np.arange(n) / SR
    mix = np.zeros(n)
    rng = np.random.RandomState(7)

    drop_t = beats2sec(INTRO_BEATS)
    end_drums = beats2sec(TOTAL_BEATS)

    # --- pad (chords, detuned sines, slow swell) -----------------------------
    pad = np.zeros(n)
    track_beats = TOTAL_BEATS + OUTRO_BEATS
    for bar, ch in enumerate(PROGRESSION):
        if bar * 8 >= track_beats:
            break
        t0 = beats2sec(bar * 8)
        t1 = min(beats2sec((bar + 1) * 8) + 1.0, total)  # let chords bleed a little
        i0, i1 = int(t0 * SR), min(n, int(t1 * SR))
        if i1 <= i0:
            continue
        tt = t[i0:i1] - t0
        seg = np.zeros(i1 - i0)
        for f in ch["chord"]:
            for det in (-0.15, 0.0, 0.15):  # gentle detune shimmer
                seg += np.sin(2 * np.pi * (f + det) * tt + rng.uniform(0, 6.28))
            seg += 0.35 * np.sin(2 * np.pi * f * 2 * tt)  # octave sparkle
        seg /= len(ch["chord"]) * 2.35 * 2.0
        # intro: slow swell; after the drop: steady
        if bar * 8 < INTRO_BEATS:
            seg *= 0.22 + 0.5 * np.clip(tt / beats2sec(INTRO_BEATS), 0, 1) ** 2
        else:
            seg *= 0.78
        # fade the chord's tail
        seg_len = i1 - i0
        tail = np.clip((seg_len - np.arange(seg_len)) / SR / 0.8, 0, 1)
        seg *= tail
        pad[i0:i1] += seg

    # --- sub bass (root notes, sidechained) -----------------------------------
    sub = np.zeros(n)
    for bar, ch in enumerate(PROGRESSION):
        if bar * 8 >= track_beats:
            break
        t0 = beats2sec(bar * 8)
        t1 = beats2sec((bar + 1) * 8)
        i0, i1 = int(t0 * SR), min(n, int(t1 * SR))
        tt = t[i0:i1] - t0
        if bar * 8 >= INTRO_BEATS:
            seg = np.sin(2 * np.pi * ch["root"] * tt)
            # 8th-note pulse shaping
            phase8 = (tt / (BEAT / 2)) % 1.0
            seg *= 0.55 + 0.45 * np.exp(-phase8 * 2.2)
            sub[i0:i1] += seg
    sub *= 0.30

    # --- kick ------------------------------------------------------------------
    kick_times = [beats2sec(b) for b in range(INTRO_BEATS, TOTAL_BEATS)]
    kick = np.zeros(n)
    for i, tk in enumerate(kick_times):
        i0 = int(tk * SR)
        length = int(0.32 * SR)
        tt = np.arange(length) / SR
        f = 44 + 116 * np.exp(-tt / 0.022)
        phase = 2 * np.pi * np.cumsum(f) / SR
        body = np.sin(phase) * np.exp(-tt / 0.10)
        click = rng.randn(length) * np.exp(-tt / 0.004) * 0.35
        kick[i0 : i0 + length] += body + click
    kick *= 0.85

    # --- hats (offbeat 8ths) ----------------------------------------------------
    hat = np.zeros(n)
    for b in range(INTRO_BEATS, TOTAL_BEATS):
        for off in (0.5,):  # offbeat only
            th = beats2sec(b + off)
            i0 = int(th * SR)
            length = int(0.07 * SR)
            noise = rng.randn(length)
            # crude highpass via difference
            noise = np.diff(noise, prepend=0.0)
            envn = np.exp(-np.arange(length) / SR / 0.018)
            hat[i0 : i0 + length] += noise * envn
    hat *= 0.16

    # --- snare (beats 2 & 4) ----------------------------------------------------
    snare = np.zeros(n)
    for b in range(INTRO_BEATS + 4, TOTAL_BEATS):
        if b % 2 != 0:
            continue
        ts = beats2sec(b)
        i0 = int(ts * SR)
        length = int(0.18 * SR)
        tt = np.arange(length) / SR
        noise = rng.randn(length)
        noise = np.diff(noise, prepend=0.0)
        tone = np.sin(2 * np.pi * 190 * tt) * 0.4
        envn = np.exp(-tt / 0.055)
        snare[i0 : i0 + length] += (noise * 0.7 + tone) * envn
    snare *= 0.20

    # --- sidechain duck (from kicks) --------------------------------------------
    duck = np.ones(n)
    for tk in kick_times:
        i0 = int(tk * SR)
        length = int(0.30 * SR)
        tt = np.arange(length) / SR
        duck[i0 : i0 + length] = np.minimum(
            duck[i0 : i0 + length], 0.25 + 0.75 * (1 - np.exp(-tt / 0.10))
        )

    mix += pad * duck
    mix += sub * (0.4 + 0.6 * duck)
    mix += kick
    mix += hat
    mix += snare

    # --- master: gentle saturation, fades, normalize -----------------------------
    mix = np.tanh(mix * 1.4) / np.tanh(1.4)
    fade_in = int(0.05 * SR)
    mix[:fade_in] *= np.linspace(0, 1, fade_in)
    fade_out = int(1.0 * SR)
    mix[-fade_out:] *= np.linspace(1, 0, fade_out)
    mix /= max(1e-9, np.max(np.abs(mix)))
    mix *= 0.89  # ~ -1 dBFS

    # stereo: tiny haas offset on pad-ish content for width
    left = mix.copy()
    right = np.roll(mix, int(0.00045 * SR))
    stereo = np.stack([left, right], axis=1)
    pcm = (stereo * 32767).astype(np.int16)

    out_dir = Path(__file__).resolve().parent.parent / "public" / "demo"
    out_dir.mkdir(parents=True, exist_ok=True)
    wav_path = out_dir / "demo-track-tmp.wav"
    with wave.open(str(wav_path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())

    mp3_path = out_dir / "fantasize-demo.mp3"
    r = subprocess.run(
        [
            sys.executable, "-c",
            "import imageio_ffmpeg,sys;print(imageio_ffmpeg.get_ffmpeg_exe())",
        ],
        capture_output=True, text=True,
    )
    ffmpeg = r.stdout.strip()
    subprocess.run(
        [ffmpeg, "-y", "-i", str(wav_path), "-codec:a", "libmp3lame", "-b:a", "192k", str(mp3_path)],
        check=True, capture_output=True,
    )
    wav_path.unlink()
    print(f"wrote {mp3_path} ({mp3_path.stat().st_size/1e6:.2f} MB, {total:.1f}s, drop at {drop_t:.2f}s)")


if __name__ == "__main__":
    main()
