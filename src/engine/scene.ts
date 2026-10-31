/**
 * Scene orchestration: one call renders one frame at time t.
 * Preview and export share this exact path.
 */

import type { AudioFeatures } from './analysis';
import type { MediaAssets } from './media';
import type { Palette } from './palette';
import type { ProjectSettings } from '../state';
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
}

export function createScene(F: AudioFeatures, S: ProjectSettings, media: MediaAssets, palette: Palette): Scene {
  return { F, S, media, palette, specBuf: new Float32Array(64) };
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
