# Vlexyna Studio

**A free, unlimited, audio-reactive music video maker — a complete, enhanced alternative to [vizzy.io](https://vizzy.io), running 100% in your browser.**

No account. No watermark. No uploads. Everything renders locally on your machine.

![Vlexyna](https://img.shields.io/badge/status-ready-22d3ee) ![tests](https://img.shields.io/badge/smoke%20tests-83%2F83-34d399) ![license](https://img.shields.io/badge/license/MIT-7c5cff)

## Run it

```bash
# any static file server, e.g.
python3 -m http.server 8080
# then open http://localhost:8080
```

No build step, no dependencies, no network calls at runtime (fonts fall back gracefully offline).

## Feature tour

### Layers (17 types, unlimited count, drag-to-reorder)
| Category | Layers |
|---|---|
| Background | Background (color / gradient / image), Aurora/Plasma field |
| Visuals | Spectrum (bars, mirror, radial, LED blocks, dots), Audio Wave (line, fill, mirror, circle, dual-circle), Particles, Starfield/Warp, Tunnel, Beat Rings |
| Media | Image (circle mask, bass pulse, spin, bob), Video (rate control, synced to transport) |
| Text | Text (gradients, strokes, 7 animations incl. typewriter), **Lyrics** (LRC/TTML import, tap-sync editor, karaoke sweep, pop/fade/slide/zoom styles) |
| Decor | Confetti, Bokeh Orbs, Perspective Grid (synthwave sun), Progress Bar (song-aware), Shape |

Every layer has: position / scale / rotation / opacity / blend mode (14 modes) / mirror (H/V/quad) / a time span on the timeline / an audio-reactivity setup / its own effect stack.

### Effects (16, stackable per layer, plus global post-FX)
Glow · Gaussian Blur · Box Blur · Directional (motion) Blur · Radial (zoom) Blur · Channel Shift (RGB split) · Vignette · Edge Detection · Pixelate · Film Grain · Scanlines (CRT) · Color Correct · Gradient Map · Drop Shadow · Skew · Mirror.

### Audio reactivity + math automations
- Bind **any** property (transform or per-layer parameter) to **bass / mids / treble / overall level / beat pulse** with an amount slider.
- Or drive it with an **expression**: `sin(t*2)*40 + bass*90 + clamp(v1,0,10)` — with `t`, `dt`, band values, beat, global variables `v1–v4` and ~25 functions.
- Beat detection runs on live bass energy with attack/release envelopes per band.

### Timeline
Waveform audio track, per-layer tracks with draggable / trimmable time spans, zoomable ruler with snapping, playhead scrubbing, lyric-aware editing.

### Export (all local)
- **Video** — MP4 (H.264) where supported, WebM (VP9/Opus) otherwise; up to **8K** (vizzy caps at 4K), 30/60 fps, four bitrate tiers, optional audio, real-time recording with progress + cancel.
- **PNG frame** snapshot at full resolution.
- **PNG sequence** → ZIP for external encoding pipelines.
- **`.vlx` project files** — JSON with embedded image/video assets, import & export.

### Projects & templates
- 16 built-in templates (Trap Nation, Synthdrive, Lyric Focus, Glitch VHS, …).
- Unlimited named projects autosaved to browser storage, with a project manager.
- **Synthesized demo track** — generates a full beat (kick, snare, hats, bass, pads, arps, risers) via WebAudio offline rendering, so you can try everything with zero files.

### Extras vizzy doesn't have
- **Live mic mode** — visuals react to your microphone for live sets (press `M`).
- Keyboard-first workflow (`Space`, `Ctrl+Z`, arrows-nudge, `F` fullscreen presentation, …).
- Drop **anything** anywhere: audio, images, videos, `.lrc`/`.ttml` lyrics, `.vlx` projects.
- Beat indicator, FPS meter, preview quality scaling for weak machines, visible error reporting.

## Tech

Vanilla JS + Canvas 2D, WebAudio API, MediaRecorder. ~5,500 lines, zero dependencies, zero build. Deterministic seeds keep randomized layers stable across renders.

```
js/util.js       helpers, icons, zip writer, toasts
js/expr.js       safe math expression evaluator
js/audio.js      playback, FFT bands, beat detection, demo synth
js/fx.js         effect stack engine
js/layers.js     visual layer types
js/media.js      image/video/text/lyrics/progress + asset store
js/renderer.js   composition pipeline + preview loop
js/project.js    model, undo/redo, persistence
js/templates.js  template gallery
js/exporter.js   video / PNG / frame-sequence export
js/ui.js         studio interface
test/smoke.js    headless jsdom test harness (83 assertions)
```

## Test

```bash
npm install jsdom   # test-only dependency
node test/smoke.js
```
