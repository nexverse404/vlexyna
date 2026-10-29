# Vlexyna Studio

**A free, unlimited, audio-reactive music video studio.** A complete, enhanced
alternative to vizzy.io — running fully local in a Tauri 2 desktop app (and any
modern browser), with no accounts, no watermark and no uploads.

Built with **Tauri 2 + Vite + Vue 3**, on top of a zero-dependency
Canvas2D/WebGL engine that ships as plain ES modules.

[![CI](https://github.com/nexverse404/vlexyna/actions/workflows/ci.yml/badge.svg)](https://github.com/nexverse404/vlexyna/actions/workflows/ci.yml)
![effects](https://img.shields.io/badge/effects-64-7c6cf0) ![layers](https://img.shields.io/badge/layer%20types-22-22d3ee) ![templates](https://img.shields.io/badge/templates-33-f472b6)

## Run it

```bash
npm install

# desktop app (needs Rust: https://rustup.rs)
npm run tauri dev      # develop with hot reload in the native window
npm run tauri build    # installers for your OS (msi/nsis, dmg/app, deb/appimage)

# or just the web app — everything works in a browser too
npm run dev            # http://localhost:1420
npm run build          # static build → dist/
```

The legacy no-build web app still lives in `web/` (open `web/index.html`
through any static server rooted at the repo root).

## What it does

| | |
|---|---|
| **64 effects** | the full vizzy.io set — blur family (two-pass, box, directional, zoom, triangular, bokeh, tilt-shift, channel, h/v), light (glow, bloom, streaks, god rays), color (grade, tint, chroma shift, gradient map, chroma key, CAS, flicker), warp (bulge, fisheye ×2, twirl, polar, kaleidoscope, ripple, impact ripple, liquify, displacement, glitch), stylize (VHS ×2, spooky, scanlines, grain, edge, pixelate, outline + advanced, shadows, distance field, morphing fractal), temporal (time stop, trail, render layer), and more — every one Canvas2D-fast and stackable per layer **and** as global post FX |
| **22 layer types** | spectrum (bars/radial/wave/LED…), waveform, plasma/aurora, particles, 3D particles, starfield, tunnel, beat rings, bokeh orbs, confetti, perspective grid, shapes, **GLSL shader layer** (write your own fragment shaders with audio uniforms + 5 presets), spherical field, image, video, **Lottie animations** (drop any lottie .json — free-running or synced to the music), **Butterchurn** (the MilkDrop-class preset visualizer, hundreds of classic presets), text, lyrics, progress bar, background |
| **Audio reactivity** | bass / mid / treble / level / beat detection, live mic mode, demo beat synthesized in-browser, wave + spectrum data available to layers, shaders *and* automations (`beat*0.3`, `fft(80,200)`, `freq(0)`, `easeInOut(x)`, `atan2`, `delta('k',x)`, `sin(t*2)*.2` — bind any slider with the **ƒ** button), **custom audio analyzers** — named analysis channels with their own frequency range, sensitivity, smoothing, output clamp and delta mode, used as `an('Name')` or bare identifiers in any automation, with a live value readout in the Inspector — plus a global **reactivity mixer** (R), per-automation min/max/smoothing, a project-wide **automations browser** (see and toggle every binding at once), and a **playback speed** control (0.75×–2× — nightcore/slowed, pitch follows like tape) |
| **Four export engines** | **MP4 offline** — frame-exact WebCodecs encoding via mediabunny with the audio spectrum *precomputed* by a built-in FFT, so offline renders are fully audio-reactive and usually faster than real time, with your choice of **H.264 / H.265 / VP9 / AV1** (with graceful fallback) and a file-size estimate; **real-time video** (WebM/MP4 via MediaRecorder) everywhere else; **PNG frame sequences** zipped; **animated GIF** — audio-reactive, quantized and encoded in-browser, social-ready. Any canvas size up to 8K, PNG frame grabs any time |
| **Editor craft** | **click any layer on the canvas to select it** (pixel-accurate hit testing) and drag it anywhere — including off-screen, on-canvas transform gizmo (handles to rotate/scale with live readout), stage zoom (fit → 200%, Ctrl+scroll), clipboard (Ctrl+C/X/V pastes at the playhead), split layers at the playhead (S), **multi-select** (Ctrl/Cmd-click — bulk delete), **shy layers**, drag-reorder layers, right-click timeline clips for actions, per-layer opacity/blend/mirror/automation, **every slider edit is undoable**, **global variables** (G) — named project-wide knobs usable in every math automation and injected into shaders as `uG_name`, **F3 performance overlay**, **audio-reactive camera** — one global zoom/pan/rotate/shake that punches in on the bass and jolts on beats (Punch / Breathe / Quake presets in the Inspector) |
| **Custom fonts & text variables** | drop any .ttf/.otf/.woff — registered live and offered in every text/lyrics font picker, round-tripped inside .vlx projects. Text layers read ID3 tags straight off the track: `{title}`, `{artist}`, `{album}`, `{year}`, `{genre}`, `{bpm}`, `{filename}` — the transport shows what it found |
| **Lyrics** | LRC / TTML import, karaoke sweep + 4 more line styles, tap-sync time stamping |
| **Timeline** | drag clips to move, edges to trim, snap, per-layer lanes, waveform + ruler |
| **Image tools** | interactive crop editor, circle mask, contain/cover, pulse/spin/bob motion |
| **Projects** | autosaved locally, multi-project browser, undo/redo, `.vlx` project import/export (share projects as files — no cloud, no account) |
| **Templates & remixing** | 33 genre-ready starting points (incl. **Bass Boost Edit**, **Magic Shivers** and **Neon Waveform** — bars/curves + center video + branding + reactive camera, the YouTube-edit recipe in one click) (Trap Nation, Hip-Hop Bars, Lo-Fi Study, DnB Rush, Metal Storm, Jazz Club, Podcast Pro, Cinematic Trailer, K-Pop Sparkle, Reggaeton Heat…) plus **save any project as your own reusable template** and share it as a .vlx file |
| **Design** | taste-skill house style — Space Grotesk + IBM Plex Mono, one accent, flat surfaces, honest empty states |
| **Any viewport** | progressive layout — panels become drawers and the timeline collapses on narrow screens, short windows keep a usable stage, keyboard-focus rings, reduced-motion support |
| **Performance** | paused-idle costs ≈ zero CPU (dirty-flag rendering — a frame only draws when something changed), **adaptive preview quality** steps live playback down when fps drops and back up on recovery, zero per-frame allocations in the render loop (scratch audio/props objects, cached global-var name lists, cached spectrum color LUTs), debounced autosave, `imageSmoothingQuality: high` |
| **Media library** | **stock images generated in your browser** (aurora, sunset grid, bokeh, rays, noise, checker — zero downloads, free to use in any project) + your own uploads (under ~1.5 MB persist across projects in this browser), one-click insert as layers, fonts register in every picker, synthesized demo beat as the stock audio track |

## Repository layout

```
engine/       the studio engine — plain ESM, zero deps (fx, fx2, layers, layers2,
              layers3, renderer, audio, expr, params, media, project, templates,
              exporter, offline — offline.js holds the FFT timeline + mediabunny export)
src/          Vue 3 app (components, store, app controller, design system)
src-tauri/    Tauri 2 shell (thin Rust wrapper + unit tests, capabilities,
              icons generated by npm run icons)
web/          legacy no-build web app (same engine)
test/         smoke.js (196 checks) · boot.js (71 built-app checks) · render.js (visual QA + GIF)
```

## Tests

```bash
npm test              # headless smoke: all layers, all 64 fx, all 30 templates,
                      # custom-template library, reactivity mixer, fonts,
                      # butterchurn fallback, global vars, ID3 tags, codecs, camera,
                      # offline FFT timeline, Lottie/crop paths, expr, lyrics,
                      # undo, persistence, exporter, GIF guard (177 checks)
npm run build && npm run test:boot   # mounts the real built app in jsdom
npm run test:render   # renders every template + fx grid + offline frames
                      # + a real audio-reactive GIF through gifenc to test/out/
```

CI (`.github/workflows/ci.yml`) runs the JS suite plus the Rust side on every
push: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
`cargo check --all-targets` and `cargo test` against the **latest stable
toolchain**, after building the frontend (Tauri embeds `dist/` at compile time).

## License & credits

Engine code is original (Canvas2D/JS). Bundled extras: mediabunny (MPL-2.0) for offline muxing and lottie-web (MIT) for Lottie playback — both lazy-loaded; the engine itself stays dependency-free. Effect inspiration and prior art credited
to the vizzy.io open-source page: Butterchurn (jberg, MIT), Seriously.js,
otdavies, AMD FidelityFX CAS, bluemir, staffantan (CC-BY), Julien
Moreau-Mathis, Cubiq, clara, blaze33, stegu webgl-noise, halvves,
UltraMoogleMan/Ryan Holtz/ImJezze (BSD-3), and PixiJS.
