/**
 * Style presets — complete looks in one click, and a dice roll.
 * Each preset bundles palette + grade + motion + flare + bokeh + spectrum,
 * deliberately tuned, so switching is a real choice rather than 12 sliders.
 */

import type { ProjectSettings } from '../state';

export interface StylePreset {
  id: string;
  label: string;
  dots: [string, string, string];
  apply(S: ProjectSettings): void;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'fantasize',
    label: 'Fantasize',
    dots: ['#c86bff', '#ff6fd8', '#ff9a5c'],
    apply(S) {
      S.grade.preset = 'fantasize';
      S.grade.tint = 0.55;
      S.grade.vignette = 0.45;
      S.grade.glow = 0.6;
      S.grade.grain = 0.25;
      S.motion.zoomDepth = 0.55;
      S.motion.shake = 0.4;
      S.motion.rotate = 1;
      S.motion.echo = 0.35;
      S.motion.release = 0.22;
      S.flare = { x: 0.74, y: 0.16, angle: 118, thickness: 1, ghosts: true, reactivity: 0.55 };
      S.particles = { count: 110, size: 1, speed: 1, reactivity: 0.6, wind: 0, twinkle: 0.35 };
      S.spectrum = { style: 'bars', x: 0.5, y: 0.975, width: 0.9, bars: 48, height: 0.16, opacity: 0.75, caps: false };
      S.intro = { style: 'shutter', duration: 2.8 };
    },
  },
  {
    id: 'aqua',
    label: 'Deep Aqua',
    dots: ['#20c0c0', '#80e0e0', '#bffcf0'],
    apply(S) {
      S.grade.preset = 'teal';
      S.grade.tint = 0.5;
      S.grade.vignette = 0.4;
      S.grade.glow = 0.55;
      S.grade.grain = 0.2;
      S.motion.zoomDepth = 0.6;
      S.motion.shake = 0.35;
      S.motion.rotate = 0.7;
      S.motion.echo = 0.45;
      S.motion.release = 0.26;
      S.flare = { x: 0.2, y: 0.14, angle: 64, thickness: 0.8, ghosts: true, reactivity: 0.4 };
      S.particles = { count: 150, size: 0.8, speed: 0.7, reactivity: 0.5, wind: 0.15, twinkle: 0.5 };
      S.spectrum = { style: 'ring', x: 0.5, y: 0.44, width: 0.9, bars: 64, height: 0.14, opacity: 0.7, caps: false };
      S.intro = { style: 'fade', duration: 2.2 };
    },
  },
  {
    id: 'sunset',
    label: 'Sunset Drive',
    dots: ['#ff7a4d', '#ffd27a', '#ffc46b'],
    apply(S) {
      S.grade.preset = 'sunset';
      S.grade.tint = 0.6;
      S.grade.vignette = 0.5;
      S.grade.glow = 0.65;
      S.grade.grain = 0.3;
      S.motion.zoomDepth = 0.5;
      S.motion.shake = 0.45;
      S.motion.rotate = 1.2;
      S.motion.echo = 0.3;
      S.motion.release = 0.2;
      S.flare = { x: 0.82, y: 0.2, angle: 112, thickness: 1.6, ghosts: true, reactivity: 0.7 };
      S.particles = { count: 90, size: 1.2, speed: 0.6, reactivity: 0.55, wind: -0.1, twinkle: 0.3 };
      S.spectrum = { style: 'mirror', x: 0.5, y: 0.95, width: 0.72, bars: 56, height: 0.14, opacity: 0.8, caps: true };
      S.intro = { style: 'bars', duration: 2.4 };
    },
  },
  {
    id: 'neon',
    label: 'Neon Club',
    dots: ['#ff2d95', '#2de2ff', '#ffe75e'],
    apply(S) {
      S.grade.preset = 'custom';
      S.grade.custom = { accent: '#ff2d95', accent2: '#2de2ff', particle: '#ffe75e', tintB: '#7a5cff' };
      S.grade.tint = 0.7;
      S.grade.vignette = 0.5;
      S.grade.glow = 0.9;
      S.grade.grain = 0.2;
      S.motion.zoomDepth = 0.7;
      S.motion.shake = 0.55;
      S.motion.rotate = 1.3;
      S.motion.echo = 0.55;
      S.motion.release = 0.3;
      S.flare = { x: 0.5, y: 0.1, angle: 90, thickness: 2.2, ghosts: true, reactivity: 0.8 };
      S.particles = { count: 80, size: 0.7, speed: 1.6, reactivity: 0.8, wind: 0, twinkle: 0.8 };
      S.spectrum = { style: 'bars', x: 0.5, y: 0.97, width: 0.96, bars: 72, height: 0.22, opacity: 0.85, caps: true };
      S.intro = { style: 'shutter', duration: 1.6 };
    },
  },
  {
    id: 'mono',
    label: 'Midnight Mono',
    dots: ['#e8e8f0', '#9aa3b8', '#5c6478'],
    apply(S) {
      S.grade.preset = 'custom';
      S.grade.custom = { accent: '#e8e8f0', accent2: '#9aa3b8', particle: '#cfd6e4', tintB: '#dfe6f0' };
      S.grade.tint = 0.25;
      S.grade.vignette = 0.6;
      S.grade.glow = 0.35;
      S.grade.grain = 0.45;
      S.motion.zoomDepth = 0.4;
      S.motion.shake = 0.25;
      S.motion.rotate = 0.5;
      S.motion.echo = 0.25;
      S.motion.release = 0.3;
      S.flare = { x: 0.26, y: 0.12, angle: 96, thickness: 0.6, ghosts: false, reactivity: 0.3 };
      S.particles = { count: 60, size: 0.6, speed: 0.45, reactivity: 0.35, wind: 0, twinkle: 0.25 };
      S.spectrum = { style: 'bars', x: 0.5, y: 0.965, width: 0.85, bars: 40, height: 0.1, opacity: 0.55, caps: false };
      S.intro = { style: 'fade', duration: 3.2 };
    },
  },
];

/** Roll the dice within the bounds of taste. */
export function surpriseMe(S: ProjectSettings): void {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  pick(STYLE_PRESETS).apply(S);
  S.flare.angle = 40 + Math.random() * 100;
  S.flare.thickness = 0.6 + Math.random() * 1.6;
  S.particles.count = 60 + Math.floor(Math.random() * 140);
  S.particles.wind = Math.round((Math.random() * 0.8 - 0.4) * 100) / 100;
  S.spectrum.bars = 24 + Math.floor(Math.random() * 60);
  if (Math.random() < 0.5) S.spectrum.style = pick(['bars', 'ring', 'mirror'] as const);
  S.motion.zoomDepth = Math.round((0.35 + Math.random() * 0.4) * 100) / 100;
}
