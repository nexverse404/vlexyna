/** Color identity presets. Everything visual derives from these. */

export type PresetId = 'fantasize' | 'teal' | 'sunset' | 'custom';

export interface Palette {
  name: string;
  base: string;      // canvas base / deep shadow tone
  tintA: string;     // shadow tint (bottom of grade gradient)
  tintB: string;     // highlight tint (top of grade gradient)
  accent: string;    // primary accent — spectrum, rings, flare core
  accent2: string;   // secondary accent — gradient ends
  glow: string;      // bright glow / badge text highlight
  particle: string;  // bokeh tint
}

export const PRESETS: Record<Exclude<PresetId, 'custom'>, Palette> = {
  fantasize: {
    name: 'Fantasize',
    base: '#0b0616',
    tintA: '#2a0a4a',
    tintB: '#ff9a5c',
    accent: '#c86bff',
    accent2: '#ff6fd8',
    glow: '#ffe1f0',
    particle: '#ffb7d5',
  },
  teal: {
    name: 'Deep Aqua',
    base: '#041318',
    tintA: '#0a3c46',
    tintB: '#bffcf0',
    accent: '#20c0c0',
    accent2: '#80e0e0',
    glow: '#e6fffb',
    particle: '#9fe8e0',
  },
  sunset: {
    name: 'Sunset Drive',
    base: '#140a08',
    tintA: '#3a1020',
    tintB: '#ffc46b',
    accent: '#ff7a4d',
    accent2: '#ffd27a',
    glow: '#fff0d6',
    particle: '#ffc9a3',
  },
};

export interface CustomColors {
  accent: string;
  accent2: string;
  particle: string;
  tintB: string;
}

export function resolvePalette(preset: PresetId, custom?: CustomColors): Palette {
  if (preset === 'custom') {
    const c = custom ?? { accent: '#c86bff', accent2: '#ff6fd8', particle: '#ffb7d5', tintB: '#ff9a5c' };
    return { name: 'Custom', base: '#0b0616', tintA: '#2a0a4a', glow: '#ffe1f0', ...c };
  }
  return PRESETS[preset];
}
