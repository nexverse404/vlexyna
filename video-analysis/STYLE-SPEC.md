# Reference track analysis — the style target for the fresh build

**Track**: Dream Chaos — Fantasize (Ft. Britt Lari) · Magic Records · 2:26
**Source**: SoundCloud audio (recovered via GitHub Actions) + official artwork

## Audio profile (measured)

| Property | Value | Design consequence |
|---|---|---|
| Tempo | **126 BPM**, confirmed by onset autocorrelation (0.73 at beat lag, equally strong at bar lag → pronounced 4/4) | beat interval 476 ms — punch-in/shake decay must resolve in < 0.5 s; bar cycle 1.9 s for slow breathing |
| Key | **A♯ minor** | dark-aqua palette harmonizes; avoid warm dominance |
| Arrangement | 0–19 s intro/build · 19–141 s full energy · 141–146 s outro | intro = subdued, sparse visuals; the 19 s drop moment is THE camera-punch cue; outro fades |
| Spectral balance | heavily sub/bass weighted (sub ≫ bass > lowmid > mid ≫ high) | bass-reactivity is the primary driver; treble should drive sparkle/particles, not layout |
| Loudness | loudness-war master — near-uniform RMS through the drop | simple level thresholds won't segment the drop; use spectral-flux onsets instead |

## Visual identity (from the official artwork)

- **Palette**: aquatic teal/cyan family — `#20b0b0` `#108090` `#20c0c0` highlights `#80e0e0` `#b0e0e0`, deep water `#3a7683` → `#6d9da7` (top-light gradient)
- **Structure**: luminous center subject against deep-water falloff; light rays, particles/bubbles, caustic shimmer
- **Motion language** (from the track): gentle 6-second swells in the build, hard hits on the 476 ms grid in the drop

## What the fresh visualizer should do with this

1. **Idle/build (0–19 s)**: slow breathing zoom (~6 s period), drifting particles, subdued glow
2. **Drop (19 s)**: one unmistakable transition — camera punch + shake + brightness jump, locked to the flux onset
3. **Through the drop**: bars/ring pulse on the beat grid (476 ms), bass-weighted amplitude, sparkle on hats
4. **Outro (141 s+)**: everything relaxes to the idle state over ~2 s
5. Colors stay in the teal family with one warm accent reserved for the drop moment

Raw data: `audio.json` (BPM, key, sections, spectral balance) · `audio-analysis.png` (energy/onset/spectrogram) · `fetch.log` (how it was obtained) · `audio.wav` (25.6 MB, the track itself).
