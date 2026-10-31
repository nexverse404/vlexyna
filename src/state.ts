/**
 * Project settings — everything the user can tweak. Pure data: JSON-serializable,
 * autosaved to localStorage. Media blobs live outside this (see main.ts).
 *
 * Positions are normalized (0..1 of frame width/height) so they survive
 * resolution changes, and they're draggable directly on the preview.
 */

import type { PresetId, CustomColors } from './engine/palette';

export interface ProjectSettings {
  background: {
    /** Slow cinematic drift, 0..1. */
    drift: number;
    /** Darkens the background so overlays pop, 0..1. */
    dim: number;
  };
  grade: {
    preset: PresetId;
    custom: CustomColors;
    /** Duotone grade strength 0..1. */
    tint: number;
    /** Vignette strength 0..1. */
    vignette: number;
    /** Glow/shadow-blur multiplier 0..1. */
    glow: number;
    /** Film grain 0..1. */
    grain: number;
  };
  motion: {
    sync: 'onsets' | 'beats';
    /** Zoom depth 0..1 — how hard the frame pumps with the bass. */
    zoomDepth: number;
    /** How long the zoom takes to settle after a hit, seconds. */
    release: number;
    /** Camera shake 0..1. */
    shake: number;
    /** Rotational component of the shake, 0..1. */
    rotate: number;
    /** Keep effects restrained until the drop, then let go. */
    gate: boolean;
    /** Session override of the auto-detected drop time (seconds). */
    dropTimeOverride: number | null;
  };
  flare: {
    /** Origin, normalized frame coords. */
    x: number;
    y: number;
    /** Streak direction, degrees (0 = right, 90 = down). */
    angle: number;
    /** Streak thickness multiplier 0.3..3. */
    thickness: number;
    /** Ghost circles along the optical axis. */
    ghosts: boolean;
    /** Brightness reactivity to highs/hits, 0..1. */
    reactivity: number;
  };
  particles: {
    count: number;       // 0..240
    size: number;        // 0.3..2
    speed: number;       // 0.2..2
    reactivity: number;  // 0..1
    /** Horizontal drift, -1..1. */
    wind: number;
    /** Brightness flicker, 0..1. */
    twinkle: number;
  };
  spectrum: {
    style: 'off' | 'bars' | 'ring' | 'mirror';
    /** Center X (all styles) / baseline Y (bars, mirror) / center Y (ring), 0..1. */
    x: number;
    y: number;
    /** Span of the bar field, 0.15..1 of width. */
    width: number;
    /** Number of bars, 16..96. */
    bars: number;
    /** Max height as fraction of frame height, 0.05..0.4 */
    height: number;
    opacity: number; // 0..1
    /** Peak-hold caps on bars. */
    caps: boolean;
  };
  intro: {
    style: 'shutter' | 'fade' | 'bars';
    /** Seconds until fully open. */
    duration: number;
  };
  badge: {
    enabled: boolean;
    title: string;
    subtitle: string;
    /** Center of the badge box, normalized 0..1 — set by corner presets or dragging. */
    x: number;
    y: number;
    scale: number;    // 0.6..1.6
    opacity: number;  // 0..1
  };
  exportCfg: {
    width: number;
    height: number;
    fps: number;
    quality: 'low' | 'medium' | 'high';
    trimStart: number;
    trimEnd: number | null; // null = full duration
  };
}

/** The reference look, out of the box. */
export function defaultSettings(): ProjectSettings {
  return {
    background: { drift: 0.45, dim: 0.25 },
    grade: {
      preset: 'fantasize',
      custom: { accent: '#c86bff', accent2: '#ff6fd8', particle: '#ffb7d5', tintB: '#ff9a5c' },
      tint: 0.55,
      vignette: 0.45,
      glow: 0.6,
      grain: 0.25,
    },
    motion: { sync: 'onsets', zoomDepth: 0.55, release: 0.22, shake: 0.4, rotate: 1, gate: true, dropTimeOverride: null },
    flare: { x: 0.74, y: 0.16, angle: 118, thickness: 1, ghosts: true, reactivity: 0.55 },
    particles: { count: 110, size: 1, speed: 1, reactivity: 0.6, wind: 0, twinkle: 0.35 },
    spectrum: { style: 'bars', x: 0.5, y: 0.975, width: 0.9, bars: 48, height: 0.16, opacity: 0.75, caps: false },
    intro: { style: 'shutter', duration: 2.8 },
    badge: {
      enabled: true,
      title: 'FANTASIZE',
      subtitle: 'DREAM CHAOS FT. BRITT LARI',
      x: 0.16,
      y: 0.884,
      scale: 1,
      opacity: 0.95,
    },
    exportCfg: { width: 1920, height: 1080, fps: 30, quality: 'high', trimStart: 0, trimEnd: null },
  };
}

const STORAGE_KEY = 'vlexyna:project:v2';

/** Deep-merge saved settings over defaults so old saves keep working. */
function merge<T>(base: T, over: unknown): T {
  if (over === null || over === undefined) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return over as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(over as Record<string, unknown>)) {
    const o = (over as Record<string, unknown>)[k];
    out[k] = k in out ? merge(out[k], o) : o;
  }
  return out as T;
}

export function saveSettings(s: ProjectSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. — not fatal */
  }
}

export function loadSettings(): ProjectSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('vlexyna:project:v1');
    if (!raw) return null;
    return merge(defaultSettings(), JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('vlexyna:project:v1');
  } catch {
    /* ignore */
  }
}
