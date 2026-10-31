/**
 * Scene orchestration: one call renders one frame at time t.
 * Preview and export share this exact path.
 */

import type { AudioFeatures } from './analysis';
import { envelope } from './analysis';
import type { MediaAssets } from './media';
import type { Palette } from './palette';
import type { ProjectSettings } from '../state';
import type { LayoutInfo } from './layers';
import {
  applyCamera,
  drawBackground,
  drawBadge,
  drawFlare,
  drawGrain,
  drawParticles,
  drawReveal,
  drawSpectrum,
  drawVignette,
} from './layers';

export interface Scene {
  F: AudioFeatures;
  S: ProjectSettings;
  media: MediaAssets;
  palette: Palette;
  specBuf: Float32Array;
  /** Bass envelope recomputed with the user's release setting. */
  zoomEnv: Float32Array;
  /** Boxes filled by the painters each frame — used for drag hit-testing. */
  layout: LayoutInfo;
}

export function createScene(F: AudioFeatures, S: ProjectSettings, media: MediaAssets, palette: Palette): Scene {
  const bassish = new Float32Array(F.frames);
  for (let f = 0; f < F.frames; f++) {
    bassish[f] = Math.max(F.bands[0][f] ?? 0, F.bands[1][f] ?? 0);
  }
  const zoomEnv = envelope(bassish, F.fps, 0.015, Math.max(0.05, S.motion.release));
  return {
    F,
    S,
    media,
    palette,
    specBuf: new Float32Array(64),
    zoomEnv,
    layout: { badge: null, spectrum: null, flare: null },
  };
}

export function renderFrame(
  scene: Scene,
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
): void {
  const input = { ctx, W, H, t, ...scene };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = scene.palette.base;
  ctx.fillRect(0, 0, W, H);

  // fresh layout each frame
  scene.layout.badge = null;
  scene.layout.spectrum = null;
  scene.layout.flare = null;

  // world — one camera: shake + rotation wraps everything in it
  ctx.save();
  applyCamera(input);
  drawBackground(input);
  drawParticles(input);
  drawFlare(input);
  drawSpectrum(input);
  ctx.restore();

  // lens (screen space)
  drawVignette(input);
  drawGrain(input);

  // foreground furniture
  drawReveal(input);
  drawBadge(input);
}
