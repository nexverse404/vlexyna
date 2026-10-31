/**
 * Project settings — everything the user can tweak. Pure data: JSON-serializable,
 * autosaved to localStorage. Media blobs live outside this (see main.ts).
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
    /** Camera shake 0..1. */
    shake: number;
    /** Lens flare reactivity 0..1. */
    flare: number;
    /** Keep effects restrained until the drop, then let go. */
    gate: boolean;
    /** Session override of the auto-detected drop time (seconds). */
    dropTimeOverride: number | null;
  };
  particles: {
    count: number;       // 0..240
    size: number;        // 0.3..2
    speed: number;       // 0.2..2
    reactivity: number;  // 0..1
  };
  spectrum: {
    style: 'off' | 'bars' | 'ring' | 'mirror';
    /** Max height as fraction of frame height, 0.05..0.4 */
    height: number;
    opacity: number; // 0..1
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
    position: 'bl' | 'br' | 'tl' | 'tr';
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
    motion: { sync: 'onsets', zoomDepth: 0.55, shake: 0.4, flare: 0.55, gate: true, dropTimeOverride: null },
    particles: { count: 110, size: 1, speed: 1, reactivity: 0.6 },
    spectrum: { style: 'bars', height: 0.16, opacity: 0.75 },
    intro: { style: 'shutter', duration: 2.8 },
    badge: {
      enabled: true,
      title: 'FANTASIZE',
      subtitle: 'DREAM CHAOS FT. BRITT LARI',
      position: 'bl',
      scale: 1,
      opacity: 0.95,
    },
    exportCfg: { width: 1920, height: 1080, fps: 30, quality: 'high', trimStart: 0, trimEnd: null },
  };
}

const STORAGE_KEY = 'vlexyna:project:v1';

export function saveSettings(s: ProjectSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. — not fatal */
  }
}

export function loadSettings(): ProjectSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...defaultSettings(), ...JSON.parse(raw) } as ProjectSettings;
  } catch {
    return null;
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
