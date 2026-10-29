# Vlexyna Studio

**A free, unlimited, audio-reactive music video studio.** A complete, enhanced
alternative to vizzy.io — running fully local in a Tauri 2 desktop app (and any
modern browser), with no accounts, no watermark and no uploads.

Built with **Tauri 2 + Vite + Vue 3**, on top of a zero-dependency
Canvas2D/WebGL engine that ships as plain ES modules.

[![CI](https://github.com/nexverse404/vlexyna/actions/workflows/ci.yml/badge.svg)](https://github.com/nexverse404/vlexyna/actions/workflows/ci.yml)
![effects](https://img.shields.io/badge/effects-64-7c6cf0) ![layers](https://img.shields.io/badge/layer%20types-21-22d3ee) ![templates](https://img.shields.io/badge/templates-30-f472b6)

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
| **21 layer types** | spectrum (bars/radial/wave/LED…), waveform, plasma/aurora, particles, 3D particles, starfield, tunnel, beat rings, bokeh orbs, confetti, perspective grid, shapes, **GLSL shader layer** (write your own fragment shaders with audio uniforms + 5 presets), spherical field, image, video, **Lottie animations** (drop any lottie .json — free-running or synced to the music), text, lyrics, progress bar, background |
| **Audio reactivity** | bass / mid / treble / level / beat detection, live mic mode, demo beat synthesized in-browser, wave + spectrum data available to layers, shaders *and* automations (`beat*0.3`, `fft(80,200)`, `freq(0)`, `easeInOut(x)`, `sin(t*2)*.2` — bind any slider with the **ƒ** button) — plus a global **reactivity mixer** (R) that scales each band and the beat detector for the whole project |
| **Four export engines** | **MP4 offline** — frame-exact WebCodecs encoding via mediabunny with the audio spectrum *precomputed* by a built-in FFT, so offline renders are fully audio-reactive and usually faster than real time; **real-time video** (WebM/MP4 via MediaRecorder) everywhere else; **PNG frame sequences** zipped; **animated GIF** — audio-reactive, quantized and encoded in-browser, social-ready. Any canvas size up to 8K, PNG frame grabs any time |
| **Editor craft** | on-canvas transform gizmo (drag to move, handles to rotate/scale with live readout), stage zoom (fit → 200%, Ctrl+scroll), clipboard (Ctrl+C/X/V pastes at the playhead), split layers at the playhead (S), drag-reorder layers, per-layer opacity/blend/mirror/automation |
| **Custom fonts** | drop any .ttf/.otf/.woff — registered live and offered in every text/lyrics font picker, round-tripped inside .vlx projects |
| **Lyrics** | LRC / TTML import, karaoke sweep + 4 more line styles, tap-sync time stamping |
| **Timeline** | drag clips to move, edges to trim, snap, per-layer lanes, waveform + ruler |
| **Image tools** | interactive crop editor, circle mask, contain/cover, pulse/spin/bob motion |
| **Projects** | autosaved locally, multi-project browser, undo/redo, `.vlx` project import/export (share projects as files — no cloud, no account) |
| **Templates & remixing** | 30 genre-ready starting points (Trap Nation, Hip-Hop Bars, Lo-Fi Study, DnB Rush, Metal Storm, Jazz Club, Podcast Pro, Cinematic Trailer, K-Pop Sparkle, Reggaeton Heat…) plus **save any project as your own reusable template** and share it as a .vlx file |
| **Design** | taste-skill house style — Space Grotesk + IBM Plex Mono, one accent, flat surfaces, honest empty states |
| **Any viewport** | progressive layout — panels become drawers and the timeline collapses on narrow screens, short windows keep a usable stage, keyboard-focus rings, reduced-motion support |

## Repository layout

```
engine/       the studio engine — plain ESM, zero deps (fx, fx2, layers, layers2,
              layers3, renderer, audio, expr, params, media, project, templates,
              exporter, offline — offline.js holds the FFT timeline + mediabunny export)
src/          Vue 3 app (components, store, app controller, design system)
src-tauri/    Tauri 2 shell (thin Rust wrapper + unit tests, capabilities,
              icons generated by npm run icons)
web/          legacy no-build web app (same engine)
test/         smoke.js (168 checks) · boot.js (41 built-app checks) · render.js (visual QA + GIF)
```

## Tests

```bash
npm test              # headless smoke: all layers, all 64 fx, all 30 templates,
                      # custom-template library, reactivity mixer, fonts,
                      # offline FFT timeline, Lottie/crop paths, expr, lyrics,
                      # undo, persistence, exporter, GIF guard (168 checks)
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
