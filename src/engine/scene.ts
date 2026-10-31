/**
 * Scene orchestration: one call renders one frame at time t.
 * Preview and export share this exact path.
 *
 * Also owns the hit-echo feedback buffer: after the world is drawn, the
 * previous frames (decayed, blended) are splatted back slightly scaled up —
 * a radial motion-blur that pumps with the hits. The buffer is cleared on
 * seeks/scrubs so ghosts never smear across edits.
 */

import type { AudioFeatures } from './analysis';
import { envelope, sampleAt } from './analysis';
import type { MediaAssets } from './media';
import type { Palette } from './palette';
import type { ProjectSettings } from '../state';
import { clamp, type LayoutInfo } from './layers';
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

interface EchoBuffer {
  canvas: HTMLCanvasElement | null;
  w: number;
  h: number;
  lastT: number;
}

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
  echo: EchoBuffer;
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
    echo: { canvas: null, w: 0, h: 0, lastT: -1 },
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

  // hit echo — feedback trails (screen space, before the lens)
  drawHitEcho(scene, ctx, W, H, t);

  // lens (screen space)
  drawVignette(input);
  drawGrain(input);

  // foreground furniture
  drawReveal(input);
  drawBadge(input);
}

function drawHitEcho(scene: Scene, ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void {
  const E = scene.echo;
  const dt = t - E.lastT;
  E.lastT = t;
  const sequential = dt > 0 && dt < 0.1;

  if (!sequential) {
    // scrub, seek or paused — wipe the ghosts
    if (E.canvas && E.w === W && E.h === H) {
      E.canvas.getContext('2d')?.clearRect(0, 0, W, H);
    }
    return;
  }

  if (scene.S.motion.echo <= 0.02) return;

  if (!E.canvas || E.w !== W || E.h !== H) {
    E.canvas = document.createElement('canvas');
    E.canvas.width = W;
    E.canvas.height = H;
    E.w = W;
    E.h = H;
  }
  const ectx = E.canvas.getContext('2d');
  if (!ectx) return;

  const fluxNow = sampleAt(scene.F.flux, scene.F.fps, t);
  const bass = sampleAt(scene.zoomEnv, scene.F.fps, t);
  const strength = clamp(scene.S.motion.echo * (fluxNow * 1.4 + bass * 0.5), 0, 1);
  if (strength <= 0.03) return;

  // decay the stored frames, blend the fresh one in
  ectx.globalCompositeOperation = 'destination-out';
  ectx.globalAlpha = 0.38;
  ectx.fillRect(0, 0, W, H);
  ectx.globalCompositeOperation = 'source-over';
  ectx.globalAlpha = 0.6;
  ectx.drawImage(ctx.canvas, 0, 0);
  ectx.globalAlpha = 1;

  // splat it back, scaled around the center — two taps for a richer smear
  const taps: Array<[number, number]> = [
    [1 + 0.022 * strength, Math.min(0.5, strength * 0.5)],
    [1 + 0.05 * strength, Math.min(0.28, strength * 0.28)],
  ];
  for (const [k, alpha] of taps) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H / 2);
    ctx.scale(k, k);
    ctx.translate(-W / 2, -H / 2);
    ctx.drawImage(E.canvas as HTMLCanvasElement, 0, 0);
    ctx.restore();
  }
}
