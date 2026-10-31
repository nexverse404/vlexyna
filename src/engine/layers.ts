/**
 * The painters: background, grade, bokeh, flare, spectrum, reveal, badge, grain.
 * Every function is a pure function of (t, features, settings) so the export
 * renders exactly what the preview promised. All sizes are relative to H so any
 * output resolution looks identical.
 */

import type { AudioFeatures } from './analysis';
import { sampleAt, spectrumAt } from './analysis';
import { hash01, mulberry32 } from './prng';
import type { Palette } from './palette';
import type { ProjectSettings } from '../state';
import type { MediaAssets } from './media';
import { coverRect } from './media';

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  t: number;
  F: AudioFeatures;
  S: ProjectSettings;
  media: MediaAssets;
  palette: Palette;
  /** 64-slot scratch buffer for spectrum lookups. */
  specBuf: Float32Array;
}

// ---------------------------------------------------------------------------
// small utils
// ---------------------------------------------------------------------------

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
export const easeInOutQuad = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
export const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return k * k * (3 - 2 * k);
};

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Hits (onsets or beats) inside (t - window, t], for camera shake. */
export function activeHits(F: AudioFeatures, S: ProjectSettings, t: number, windowS: number): number[] {
  const mode = S.motion.sync;
  if (mode === 'beats' && F.beats.length > 0) {
    const start = t - windowS;
    const out: number[] = [];
    for (let i = 0; i < F.beats.length; i++) {
      const b = F.beats[i];
      if (b.t > t) break;
      if (b.t >= start) out.push(i);
    }
    return out;
  }
  // onsets: binary search the sorted list
  let lo = 0;
  let hi = F.onsets.length;
  const startT = t - windowS;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (F.onsets[mid].t < startT) lo = mid + 1;
    else hi = mid;
  }
  const out: number[] = [];
  for (let i = lo; i < F.onsets.length && F.onsets[i].t <= t; i++) out.push(i);
  return out;
}

/** Energy gate: restrained before the drop, released at it. 1 = full power. */
export function energyGate(F: AudioFeatures, S: ProjectSettings, t: number): number {
  if (!S.motion.gate) return 1;
  const drop = S.motion.dropTimeOverride ?? F.dropTime;
  if (drop == null) return 1;
  return 0.3 + 0.7 * smoothstep(drop - 2.2, drop + 0.15, t);
}

// ---------------------------------------------------------------------------
// background
// ---------------------------------------------------------------------------

export function drawBackground(input: RenderInput): void {
  const { ctx, W, H, t, F, S, media, palette } = input;
  const zoomEnv = sampleAt(F.zoomEnv, F.fps, t);
  const breath = sampleAt(F.breath, F.fps, t);
  const gate = energyGate(F, S, t);
  const scale = 1.02 + S.motion.zoomDepth * 0.17 * zoomEnv * gate + 0.014 * breath;

  // extra squeeze while the reveal is still closing (fade style settles in)
  const p = clamp(t / Math.max(0.01, S.intro.duration), 0, 1);
  const settle = S.intro.style === 'fade' ? 0.05 * (1 - easeInOutQuad(p)) : 0;

  ctx.save();
  const cx = W / 2;
  const cy = H / 2;
  const drift = S.background.drift;
  const dx = drift * 0.014 * W * Math.sin((t * 2 * Math.PI) / 23 + 1.3);
  const dy = drift * 0.011 * H * Math.cos((t * 2 * Math.PI) / 31);
  ctx.translate(cx + dx, cy + dy);
  ctx.scale(scale + settle, scale + settle);
  ctx.translate(-cx, -cy);

  const vid = media.bgVideo;
  const img = media.bgImage;
  if (vid && vid.readyState >= 2) {
    const { sx, sy, sw, sh } = coverRect(vid.videoWidth || 16, vid.videoHeight || 9, W, H);
    ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, W, H);
  } else if (img && img.naturalWidth > 0) {
    const { sx, sy, sw, sh } = coverRect(img.naturalWidth, img.naturalHeight, W, H);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  } else {
    // no media yet — a tasteful gradient stand-in so the app never looks broken
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, palette.tintB);
    g.addColorStop(0.45, palette.base);
    g.addColorStop(1, palette.tintA);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const glowA = ctx.createRadialGradient(W * 0.3, H * 0.25, 0, W * 0.3, H * 0.25, H * 0.7);
    glowA.addColorStop(0, rgba(palette.accent, 0.32));
    glowA.addColorStop(1, rgba(palette.accent, 0));
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, W, H);
    const glowB = ctx.createRadialGradient(W * 0.78, H * 0.8, 0, W * 0.78, H * 0.8, H * 0.8);
    glowB.addColorStop(0, rgba(palette.accent2, 0.22));
    glowB.addColorStop(1, rgba(palette.accent2, 0));
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, W, H);
  }

  if (S.background.dim > 0) {
    ctx.fillStyle = `rgba(4,2,10,${0.55 * S.background.dim})`;
    ctx.fillRect(0, 0, W, H);
  }

  // duotone grade — warm light above, deep tint below
  if (S.grade.tint > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(palette.tintB, 0.5 * S.grade.tint));
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, rgba(palette.tintA, 0.65 * S.grade.tint));
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// camera shake (call inside its own save/restore around the world layers)
// ---------------------------------------------------------------------------

export function applyCamera(input: RenderInput): void {
  const { ctx, W, H, t, F, S } = input;
  const windowS = 0.5;
  const hits = activeHits(F, S, t, windowS);
  const gate = energyGate(F, S, t);
  const mode = S.motion.sync;
  let dx = 0;
  let dy = 0;
  let rot = 0;
  const u = H / 1080; // scale-independent units

  if (S.motion.shake > 0) {
    for (const i of hits) {
      let ts: number;
      let strength: number;
      if (mode === 'beats' && F.beats.length > 0) {
        const b = F.beats[i];
        ts = b.t;
        strength = b.strength * (b.downbeat ? 1 : 0.55);
      } else {
        const o = F.onsets[i];
        ts = o.t;
        strength = o.strength;
      }
      const age = t - ts;
      if (age < 0 || age > windowS) continue;
      const k = S.motion.shake * clamp(strength, 0.15, 1) * Math.exp(-age / 0.085) * (0.35 + 0.65 * gate);
      dx += k * 9 * u * Math.sin(age * 67 + i * 2.1);
      dy += k * 7 * u * Math.cos(age * 83 + i * 3.7);
      rot += k * 0.0038 * Math.sin(age * 56 + i * 1.3);
    }
  }

  ctx.translate(W / 2 + dx, H / 2 + dy);
  ctx.rotate(rot);
  ctx.translate(-W / 2, -H / 2);
}

// ---------------------------------------------------------------------------
// bokeh particles
// ---------------------------------------------------------------------------

export function drawParticles(input: RenderInput): void {
  const { ctx, W, H, t, F, S, palette } = input;
  const n = Math.round(S.particles.count);
  if (n <= 0) return;
  const gate = energyGate(F, S, t);
  const high = sampleAt(F.bands[4], F.fps, t);
  const air = sampleAt(F.bands[5], F.fps, t);
  const energy = 0.45 + 0.55 * clamp(S.particles.reactivity * (0.75 * high + 0.5 * air), 0, 1.2);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const r1 = hash01(i, 1);
    const r2 = hash01(i, 2);
    const r3 = hash01(i, 3);
    const r4 = hash01(i, 4);
    const r5 = hash01(i, 5);

    const rad = (0.004 + 0.017 * r1 * r1) * S.particles.size * H;
    const vy = (0.018 + 0.085 * r2) * S.particles.speed * H;
    const swayF = 0.08 + 0.22 * r3;
    const swayA = (0.008 + 0.03 * r4) * W;
    const x = (r3 * 1.08 - 0.04) * W + swayA * Math.sin(t * swayF * 2 * Math.PI + r5 * 6.283);
    const cyc = H + 2 * rad;
    const y = cyc - ((r5 * cyc + vy * t) % cyc) + rad - cyc; // upward, wrapping

    // fade in as a particle enters from the bottom edge (no pop-in)
    const born = clamp(y / (rad * 3 + 1e-6), 0, 1);

    const warm = r4 > 0.72;
    const color = r1 > 0.8 ? palette.glow : warm ? palette.tintB : palette.particle;
    const alpha = (0.10 + 0.26 * r2 * r2) * energy * gate * (warm ? 0.8 : 1) * born;

    const g = ctx.createRadialGradient(x, y, rad * 0.1, x, y, rad);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(0.55, rgba(color, alpha * 0.45));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// diagonal lens flare
// ---------------------------------------------------------------------------

export function drawFlare(input: RenderInput): void {
  const { ctx, W, H, t, F, S, palette } = input;
  const gate = energyGate(F, S, t);
  const high = sampleAt(F.bands[4], F.fps, t);
  const fluxNow = sampleAt(F.flux, F.fps, t);
  const pulse = clamp(S.motion.flare * (0.3 + 0.85 * high + 0.5 * fluxNow) * gate, 0, 1.15);
  if (pulse <= 0.01) return;

  const ox = W * 0.74;
  const oy = H * 0.16;
  const ang = 2.06; // radians, pointing down-left across the frame
  const len = W * 1.05;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // wide soft halo at the origin
  const halo = ctx.createRadialGradient(ox, oy, 0, ox, oy, H * 0.38);
  halo.addColorStop(0, rgba(palette.tintB, 0.30 * pulse));
  halo.addColorStop(0.5, rgba(palette.accent2, 0.10 * pulse));
  halo.addColorStop(1, rgba(palette.accent2, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // the streak
  const grad = ctx.createLinearGradient(ox - ux * len * 0.5, oy - uy * len * 0.5, ox + ux * len * 0.5, oy + uy * len * 0.5);
  grad.addColorStop(0, rgba(palette.glow, 0));
  grad.addColorStop(0.42, rgba(palette.glow, 0.34 * pulse));
  grad.addColorStop(0.5, rgba('#ffffff', 0.5 * pulse));
  grad.addColorStop(0.58, rgba(palette.glow, 0.34 * pulse));
  grad.addColorStop(1, rgba(palette.glow, 0));
  ctx.strokeStyle = grad;
  ctx.lineWidth = H * 0.016;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ox - ux * len * 0.5, oy - uy * len * 0.5);
  ctx.lineTo(ox + ux * len * 0.5, oy + uy * len * 0.5);
  ctx.stroke();

  // ghost circles along the optical axis
  const ghosts: Array<[number, number, number]> = [
    [0.25, 0.030, 0.35],
    [0.45, 0.055, 0.22],
    [0.70, 0.020, 0.45],
    [1.05, 0.075, 0.16],
  ];
  for (const [d, r, a] of ghosts) {
    const gx = ox - ux * len * d;
    const gy = oy - uy * len * d;
    if (gx < -H || gx > W + H || gy < -H || gy > H + H) continue;
    ctx.beginPath();
    ctx.arc(gx, gy, r * H, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(d > 0.6 ? palette.accent : palette.glow, a * pulse * 0.55);
    ctx.lineWidth = H * 0.0022;
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// spectrum
// ---------------------------------------------------------------------------

export function drawSpectrum(input: RenderInput): void {
  const { ctx, W, H, t, F, S, palette, specBuf } = input;
  if (S.spectrum.style === 'off') return;
  spectrumAt(F, t, specBuf);
  const gate = energyGate(F, S, t);
  const maxH = S.spectrum.height * H * (0.4 + 0.6 * gate);
  const alpha = S.spectrum.opacity;
  const glowPx = S.grade.glow * 16 * (H / 1080);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = rgba(palette.accent, 0.55);
  ctx.shadowBlur = glowPx;

  const style = S.spectrum.style;
  if (style === 'bars' || style === 'mirror') {
    const bars = 48;
    const usable = style === 'bars' ? W * 0.9 : W * 0.72;
    const bw = usable / bars;
    const x0 = style === 'bars' ? W * 0.05 : W / 2;
    for (let i = 0; i < bars; i++) {
      // sample the log spectrum, leaning on the low end where the music lives
      const pos = i / (bars - 1);
      const idx = Math.floor(Math.pow(pos, 1.25) * 62);
      let v = specBuf[idx] ?? 0;
      v = Math.pow(clamp(v, 0, 1), 0.85);
      const h = Math.max(2, v * maxH);
      const mix = pos;
      const col = mixHex(palette.accent, palette.accent2, mix);
      ctx.fillStyle = col;
      if (style === 'bars') {
        const x = x0 + i * bw + bw * 0.18;
        rr(ctx, x, H - h - H * 0.025, bw * 0.64, h, bw * 0.32);
        ctx.fill();
      } else {
        const x = x0 + (i / bars) * (usable / 2);
        rr(ctx, x, H - h - H * 0.025, bw * 0.64 * 0.5 + 1, h, bw * 0.3);
        ctx.fill();
        const xm = x0 - (i / bars) * (usable / 2) - bw * 0.32;
        rr(ctx, xm, H - h - H * 0.025, bw * 0.64 * 0.5 + 1, h, bw * 0.3);
        ctx.fill();
      }
    }
  } else if (style === 'ring') {
    const cx = W / 2;
    const cy = H * 0.46;
    const baseR = Math.min(W, H) * 0.185;
    const bars = 72;
    ctx.lineWidth = Math.max(2, H * 0.0042);
    for (let i = 0; i < bars; i++) {
      const pos = i / bars;
      const idx = Math.floor(Math.pow(pos < 0.5 ? pos * 2 : (1 - pos) * 2, 1.2) * 62);
      let v = specBuf[idx] ?? 0;
      v = Math.pow(clamp(v, 0, 1), 0.85);
      const len = Math.max(3, v * maxH * 1.15);
      const a = pos * Math.PI * 2 - Math.PI / 2 + t * 0.12;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      ctx.strokeStyle = mixHex(palette.accent, palette.accent2, Math.abs(pos * 2 - 1));
      ctx.beginPath();
      ctx.moveTo(cx + cos * baseR, cy + sin * baseR);
      ctx.lineTo(cx + cos * (baseR + len), cy + sin * (baseR + len));
      ctx.stroke();
    }
    // faint inner ring
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(palette.glow, 0.18);
    ctx.lineWidth = Math.max(1, H * 0.0012);
    ctx.beginPath();
    ctx.arc(cx, cy, baseR - H * 0.008, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function mixHex(a: string, b: string, k: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * clamp(k, 0, 1)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---------------------------------------------------------------------------
// reveal (shutter / fade / bars)
// ---------------------------------------------------------------------------

export function drawReveal(input: RenderInput): void {
  const { ctx, W, H, t, S, palette } = input;
  const dur = Math.max(0.2, S.intro.duration);
  const p = clamp(t / dur, 0, 1);
  if (p >= 1) return;
  const closed = 1 - easeOutCubic(p);

  ctx.save();
  ctx.fillStyle = '#030209';
  if (S.intro.style === 'shutter') {
    const hHalf = (closed * H) / 2;
    ctx.fillRect(0, 0, W, hHalf);
    ctx.fillRect(0, H - hHalf, W, hHalf);
    // light catching the curtain edges
    const edge = rgba(palette.accent, 0.4 * closed);
    ctx.fillStyle = edge;
    ctx.fillRect(0, hHalf - 2, W, 2.5);
    ctx.fillRect(0, H - hHalf, W, 2.5);
  } else if (S.intro.style === 'bars') {
    const wHalf = (closed * W) / 2;
    ctx.fillRect(0, 0, wHalf, H);
    ctx.fillRect(W - wHalf, 0, wHalf, H);
    ctx.fillStyle = rgba(palette.accent, 0.4 * closed);
    ctx.fillRect(wHalf - 2, 0, 2.5, H);
    ctx.fillRect(W - wHalf, 0, 2.5, H);
  } else {
    ctx.globalAlpha = 1 - easeInOutQuad(p);
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// song badge
// ---------------------------------------------------------------------------

export function drawBadge(input: RenderInput): void {
  const { ctx, W, H, t, S, media, palette } = input;
  if (!S.badge.enabled) return;
  const title = S.badge.title.trim();
  const subtitle = S.badge.subtitle.trim();
  if (!title && !subtitle && !media.logo) return;

  const appear = easeOutCubic(clamp((t - S.intro.duration) / 0.7, 0, 1));
  if (appear <= 0) return;
  const sc = S.badge.scale;
  const pad = 0.018 * H * sc;
  const d = 0.086 * H * sc;          // logo diameter
  const gap = 0.022 * H * sc;
  const titleSize = 0.055 * H * sc;
  const subSize = 0.0215 * H * sc;

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${0.06 * subSize}px`;
  } catch {
    /* older browsers */
  }
  ctx.font = `600 ${subSize}px Inter, system-ui, -apple-system, sans-serif`;
  const subW = subtitle ? ctx.measureText(subtitle.toUpperCase()).width : 0;
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${0.015 * titleSize}px`;
  } catch {
    /* older browsers */
  }
  ctx.font = `${titleSize}px "Bebas Neue", "Oswald", "Arial Narrow", sans-serif`;
  const titleW = title ? ctx.measureText(title).width : 0;

  const textW = Math.max(titleW, subW);
  const boxH = d + pad * 2;
  const boxW = pad + d + gap + textW + pad * 1.6;

  const pos = S.badge.position;
  const mX = 0.042 * W;
  const mY = 0.055 * H;
  const right = pos === 'br' || pos === 'tr';
  const top = pos === 'tl' || pos === 'tr';
  const slide = (1 - appear) * 0.03 * W * (right ? 1 : -1);
  const x0 = right ? W - mX - boxW + slide : mX + slide;
  const y0 = top ? mY : H - mY - boxH;

  ctx.globalAlpha = S.badge.opacity * appear;

  // pill
  ctx.fillStyle = rgba('#0a0614', 0.55);
  rr(ctx, x0, y0, boxW, boxH, boxH / 2);
  ctx.fill();
  ctx.strokeStyle = rgba(palette.glow, 0.16);
  ctx.lineWidth = Math.max(1, H * 0.0011);
  rr(ctx, x0, y0, boxW, boxH, boxH / 2);
  ctx.stroke();

  // logo disc
  const lx = x0 + pad;
  const ly = y0 + pad;
  const cx = lx + d / 2;
  const cy = ly + d / 2;

  if (media.logo && media.logo.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.clip();
    const { sx, sy, sw, sh } = coverRect(media.logo.naturalWidth, media.logo.naturalHeight, d, d);
    ctx.drawImage(media.logo, sx, sy, sw, sh, lx, ly, d, d);
    ctx.restore();
  } else {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, d / 2);
    g.addColorStop(0, rgba(palette.accent, 0.55));
    g.addColorStop(1, rgba(palette.base, 0.9));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.fill();
    drawBolt(ctx, cx, cy, d * 0.72, rgba(palette.glow, 0.95));
  }
  ctx.strokeStyle = rgba(palette.accent, 0.85);
  ctx.lineWidth = Math.max(1.2, H * 0.0018);
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2 + ctx.lineWidth * 0.8, 0, Math.PI * 2);
  ctx.stroke();

  // text block
  const tx = lx + d + gap;
  if (title) {
    ctx.fillStyle = '#f5eefb';
    ctx.font = `${titleSize}px "Bebas Neue", "Oswald", "Arial Narrow", sans-serif`;
    ctx.fillText(title, tx, y0 + pad + titleSize * 0.86);
  }
  if (subtitle) {
    ctx.fillStyle = rgba(palette.glow, 0.78);
    try {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${0.06 * subSize}px`;
    } catch {
      /* older browsers */
    }
    ctx.font = `600 ${subSize}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.fillText(subtitle.toUpperCase(), tx, y0 + boxH - pad - subSize * 0.18);
  }
  ctx.restore();
}

function drawBolt(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const s = size;
  const pts: Array<[number, number]> = [
    [0.14, -0.5],
    [-0.26, 0.08],
    [-0.02, 0.08],
    [-0.14, 0.5],
    [0.26, -0.1],
    [0.02, -0.1],
  ];
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const x = cx + px * s;
    const y = cy + py * s;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ---------------------------------------------------------------------------
// vignette + grain (screen space, after the camera)
// ---------------------------------------------------------------------------

export function drawVignette(input: RenderInput): void {
  const { ctx, W, H, S } = input;
  if (S.grade.vignette <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.28, W / 2, H * 0.5, H * 0.95);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.65, 'rgba(255,255,255,1)');
  g.addColorStop(1, `rgba(${Math.round(255 * (1 - S.grade.vignette))},${Math.round(255 * (1 - S.grade.vignette * 0.9))},${Math.round(255 * (1 - S.grade.vignette * 0.95))},1)`);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

let grainTiles: HTMLCanvasElement[] | null = null;

function getGrainTiles(): HTMLCanvasElement[] {
  if (grainTiles) return grainTiles;
  grainTiles = [];
  const size = 256;
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    if (!g) continue;
    const img = g.createImageData(size, size);
    const rnd = mulberry32(1234 + k * 77);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 108 + 40 * (rnd() - 0.5) * 2;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainTiles.push(c);
  }
  return grainTiles;
}

export function drawGrain(input: RenderInput): void {
  const { ctx, W, H, t, S } = input;
  if (S.grade.grain <= 0) return;
  const tiles = getGrainTiles();
  if (tiles.length === 0) return;
  const frame = Math.floor(t * 24);
  const tile = tiles[frame % tiles.length];
  const ox = -hash01(frame, 11) * 256;
  const oy = -hash01(frame, 22) * 256;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.14 * S.grade.grain;
  for (let y = oy; y < H; y += 256) {
    for (let x = ox; x < W; x += 256) {
      ctx.drawImage(tile, x, y);
    }
  }
  ctx.restore();
}
