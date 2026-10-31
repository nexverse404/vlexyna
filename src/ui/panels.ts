/**
 * The side panels — one per concern, nothing hidden three menus deep.
 * Panels are rebuilt from app state (cheap, idempotent); live values that
 * change continuously (analysis/export progress) are pushed via callbacks.
 */

import type { AudioFeatures } from '../engine/analysis';
import { STYLE_PRESETS, surpriseMe } from '../engine/presets';
import type { ProjectSettings } from '../state';
import { canUseWebCodecs } from '../export/encode';
import { el, fmtBytes, fmtTime, renderControls } from './controls';

export interface PanelApp {
  settings: ProjectSettings;
  hasAudio(): boolean;
  audioName(): string | null;
  features(): AudioFeatures | null;
  bgName(): string | null;
  logoName(): string | null;
  analysis: { active: boolean; fraction: number; label: string };
  exportState: { running: boolean; fraction: number; label: string };
  lastExport: { filename: string; size: number; mode: string } | null;
  loadAudio(file: File): void;
  loadBg(file: File): void;
  clearBg(): void;
  loadLogo(file: File): void;
  clearLogo(): void;
  loadDemo(): void;
  seek(t: number): void;
  changed(): void;
  rebuild(): void;
  setBadgeCorner(corner: 'bl' | 'br' | 'tl' | 'tr'): void;
  startExport(): void;
  savePoster(): void;
  cancelExport(): void;
  onAnalysisProgress: ((f: number, label: string) => void) | null;
  onExportProgress: ((f: number, label: string) => void) | null;
}

export interface PanelDef {
  id: string;
  label: string;
  icon: string;
  build(container: HTMLElement, app: PanelApp): void;
}

const ICONS: Record<string, string> = {
  track: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  look: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  motion: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  particles: '<circle cx="6" cy="6" r="2"/><circle cx="17" cy="7" r="3"/><circle cx="9" cy="17" r="2.5"/><circle cx="18" cy="16" r="1.5"/>',
  spectrum: '<path d="M4 20V10M9 20V4M14 20v-8M19 20V7"/>',
  badge: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-7.2-7.2A2 2 0 013 12V5a2 2 0 012-2h7a2 2 0 011.4.6l7.2 7.2a2 2 0 010 2.6z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  reveal: '<rect x="3" y="4" width="5.5" height="16" rx="1.2"/><rect x="15.5" y="4" width="5.5" height="16" rx="1.2"/><path d="M12 5v14" stroke-dasharray="2.2 3"/>',
  export: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
};

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

const pos = pct;

const deg = (v: number) => `${Math.round(v)}°`;

const wind = (v: number) => (Math.abs(v) < 0.005 ? 'none' : `${v < 0 ? '←' : '→'} ${Math.round(Math.abs(v) * 100)}%`);

function sec(v: number): string {
  return `${v.toFixed(1)} s`;
}

export const PANELS: PanelDef[] = [
  {
    id: 'track',
    label: 'Track',
    icon: ICONS.track,
    build(container, app) {
      const F = app.features();
      if (app.analysis.active) {
        container.appendChild(el('div', 'panel-title', 'Reading your track'));
        const bar = el('div', 'progress');
        const fill = el('div', 'progress-fill');
        bar.appendChild(fill);
        container.appendChild(bar);
        const label = el('div', 'note', app.analysis.label);
        container.appendChild(label);
        app.onAnalysisProgress = (f, text) => {
          fill.style.width = `${Math.round(f * 100)}%`;
          label.textContent = text;
        };
        return;
      }
      app.onAnalysisProgress = null;

      if (!app.hasAudio()) {
        container.appendChild(el('div', 'panel-title', 'Start with a track'));
        container.appendChild(
          el(
            'div',
            'note',
            'Drop an MP3, WAV, FLAC or M4A anywhere on the page. Vlexyna listens to it — tempo, hits, bass, the drop — and drives the visuals from what it hears.',
          ),
        );
        renderControls(container, [
          {
            kind: 'file',
            label: 'Audio file',
            accept: 'audio/*,.mp3,.wav,.flac,.m4a,.ogg',
            button: 'Choose track…',
            onFile: (f) => app.loadAudio(f),
          },
          { kind: 'button', label: 'Try the demo track + artwork', variant: 'primary', onClick: () => app.loadDemo() },
        ], () => app.changed());
        return;
      }

      container.appendChild(el('div', 'panel-title', app.audioName() ?? 'Track'));
      const bpm = F && F.bpm > 0 ? `${F.bpm} BPM` : '—';
      const drop = F?.dropTime != null ? fmtTime(F.dropTime) : 'none found';
      const grid = el('div', 'stat-grid');
      const stats: Array<[string, string]> = [
        ['Tempo', bpm],
        ['Length', F ? fmtTime(F.duration) : '—'],
        ['The drop', drop],
        ['Hits found', F ? String(F.onsets.length) : '—'],
      ];
      for (const [k, v] of stats) {
        const c = el('div', 'stat');
        c.appendChild(el('div', 'stat-k', k));
        c.appendChild(el('div', 'stat-v', v));
        grid.appendChild(c);
      }
      container.appendChild(grid);
      if (F && F.beats.length > 0) {
        container.appendChild(el('div', 'note', `Beat grid locked — ${F.beats.length} beats at ${F.bpm} BPM. Motion can ride the grid or every hit (Motion panel).`));
      }

      renderControls(container, [
        {
          kind: 'file',
          label: 'Replace track',
          accept: 'audio/*,.mp3,.wav,.flac,.m4a,.ogg',
          button: 'Choose another…',
          onFile: (f) => app.loadAudio(f),
        },
        { kind: 'note', html: 'Switching tracks keeps your look — only the analysis is redone.' },
      ], () => app.changed());
    },
  },
  {
    id: 'look',
    label: 'Look',
    icon: ICONS.look,
    build(container, app) {
      const S = app.settings;
      container.appendChild(el('div', 'panel-title', 'Style presets'));
      const row = el('div', 'preset-row');
      for (const p of STYLE_PRESETS) {
        const b = el('button', 'preset-btn');
        b.type = 'button';
        b.title = `Apply the ${p.label} look`;
        const dots = el('span', 'preset-dots');
        for (const c of p.dots) {
          const d = el('i');
          d.style.background = c;
          dots.appendChild(d);
        }
        b.appendChild(dots);
        const lbl = el('span');
        lbl.textContent = p.label;
        b.appendChild(lbl);
        b.addEventListener('click', () => {
          p.apply(app.settings);
          app.rebuild();
          app.changed();
        });
        row.appendChild(b);
      }
      container.appendChild(row);
      renderControls(
        container,
        [
          {
            kind: 'button',
            label: 'Surprise me',
            variant: 'ghost',
            onClick: () => {
              surpriseMe(app.settings);
              app.rebuild();
              app.changed();
            },
          },
        ],
        () => app.changed(),
      );

      container.appendChild(el('div', 'panel-title', 'Background & color'));
      renderControls(
        container,
        [
          {
            kind: 'file',
            label: app.bgName() ? `Background — ${app.bgName()}` : 'Background',
            accept: 'image/*,video/*',
            button: app.bgName() ? 'Replace…' : 'Choose image or video…',
            onFile: (f) => app.loadBg(f),
            hint: app.bgName()
              ? 'Video loops automatically. Cover-fit, always.'
              : 'A looping anime clip or artwork works best. Until then, a gradient stands in.',
          },
        ],
        () => app.changed(),
      );
      if (app.bgName()) {
        renderControls(
          container,
          [{ kind: 'button', label: 'Remove background', variant: 'ghost', onClick: () => app.clearBg() }],
          () => app.changed(),
        );
      }

      container.appendChild(el('div', 'panel-title', 'Grade'));
      renderControls(
        container,
        [
          {
            kind: 'segmented',
            label: 'Palette',
            options: [
              { value: 'fantasize', label: 'Purple' },
              { value: 'teal', label: 'Aqua' },
              { value: 'sunset', label: 'Sunset' },
              { value: 'custom', label: 'Custom' },
            ],
            get: () => S.grade.preset,
            set: (v) => {
              S.grade.preset = v as typeof S.grade.preset;
              app.rebuild();
            },
          },
        ],
        () => app.changed(),
      );
      if (S.grade.preset === 'custom') {
        renderControls(
          container,
          [
            { kind: 'color', label: 'Accent', get: () => S.grade.custom.accent, set: (v) => (S.grade.custom.accent = v) },
            { kind: 'color', label: 'Accent 2', get: () => S.grade.custom.accent2, set: (v) => (S.grade.custom.accent2 = v) },
            { kind: 'color', label: 'Bokeh color', get: () => S.grade.custom.particle, set: (v) => (S.grade.custom.particle = v) },
            { kind: 'color', label: 'Warm light', get: () => S.grade.custom.tintB, set: (v) => (S.grade.custom.tintB = v) },
          ],
          () => app.changed(),
        );
      }
      renderControls(
        container,
        [
          { kind: 'slider', label: 'Tint strength', min: 0, max: 1, step: 0.01, get: () => S.grade.tint, set: (v) => (S.grade.tint = v), format: pct },
          { kind: 'slider', label: 'Vignette', min: 0, max: 1, step: 0.01, get: () => S.grade.vignette, set: (v) => (S.grade.vignette = v), format: pct },
          { kind: 'slider', label: 'Glow', min: 0, max: 1, step: 0.01, get: () => S.grade.glow, set: (v) => (S.grade.glow = v), format: pct },
          { kind: 'slider', label: 'Film grain', min: 0, max: 1, step: 0.01, get: () => S.grade.grain, set: (v) => (S.grade.grain = v), format: pct },
          { kind: 'slider', label: 'Drift (slow pan)', min: 0, max: 1, step: 0.01, get: () => S.background.drift, set: (v) => (S.background.drift = v), format: pct },
          { kind: 'slider', label: 'Background dim', min: 0, max: 1, step: 0.01, get: () => S.background.dim, set: (v) => (S.background.dim = v), format: pct },
        ],
        () => app.changed(),
      );

      container.appendChild(el('div', 'panel-title', 'Lens flare'));
      renderControls(
        container,
        [
          { kind: 'slider', label: 'Angle', min: 0, max: 360, step: 1, get: () => S.flare.angle, set: (v) => (S.flare.angle = v), format: deg },
          { kind: 'slider', label: 'Thickness', min: 0.3, max: 3, step: 0.05, get: () => S.flare.thickness, set: (v) => (S.flare.thickness = v), format: (v) => `${v.toFixed(2)}×` },
          { kind: 'slider', label: 'Reactivity', min: 0, max: 1, step: 0.01, get: () => S.flare.reactivity, set: (v) => (S.flare.reactivity = v), format: pct },
          { kind: 'toggle', label: 'Ghost circles', get: () => S.flare.ghosts, set: (v) => (S.flare.ghosts = v) },
          { kind: 'slider', label: 'X position', min: 0, max: 1, step: 0.005, get: () => S.flare.x, set: (v) => (S.flare.x = v), format: pos },
          { kind: 'slider', label: 'Y position', min: 0, max: 1, step: 0.005, get: () => S.flare.y, set: (v) => (S.flare.y = v), format: pos },
          { kind: 'note', html: 'Or grab the flare’s bright core on the preview and drag it wherever you want it.' },
        ],
        () => app.changed(),
      );
    },
  },
  {
    id: 'motion',
    label: 'Motion',
    icon: ICONS.motion,
    build(container, app) {
      const S = app.settings;
      const F = app.features();
      container.appendChild(el('div', 'panel-title', 'How it moves'));
      if (!app.hasAudio()) {
        container.appendChild(el('div', 'note', 'Load a track first — motion is driven entirely by the music.'));
        return;
      }
      const hasGrid = !!F && F.beats.length > 0;
      renderControls(
        container,
        [
          {
            kind: 'segmented',
            label: 'Shake & pulse lock',
            options: [
              { value: 'onsets', label: 'Every hit' },
              { value: 'beats', label: 'Beat grid' },
            ],
            get: () => S.motion.sync,
            set: (v) => (S.motion.sync = v as typeof S.motion.sync),
            hint: hasGrid ? undefined : 'No reliable grid found in this track — “Every hit” is doing the work.',
          },
          { kind: 'slider', label: 'Bass zoom', min: 0, max: 1, step: 0.01, get: () => S.motion.zoomDepth, set: (v) => (S.motion.zoomDepth = v), format: pct, hint: 'The frame breathes in on the bass — the signature move.' },
          { kind: 'slider', label: 'Zoom release', min: 0.08, max: 0.6, step: 0.01, get: () => S.motion.release, set: (v) => (S.motion.release = v), format: sec, hint: 'How long the zoom takes to settle after each hit.' },
          { kind: 'slider', label: 'Kick shake', min: 0, max: 1, step: 0.01, get: () => S.motion.shake, set: (v) => (S.motion.shake = v), format: pct },
          { kind: 'slider', label: 'Rotation shake', min: 0, max: 1, step: 0.01, get: () => S.motion.rotate, set: (v) => (S.motion.rotate = v), format: pct, hint: 'Adds a subtle rotational jolt to the shake.' },
          { kind: 'slider', label: 'Hit echo', min: 0, max: 1, step: 0.01, get: () => S.motion.echo, set: (v) => (S.motion.echo = v), format: pct, hint: 'Feedback trails that pump with the hits — motion-blur energy.' },
        ],
        () => app.changed(),
      );

      container.appendChild(el('div', 'panel-title', 'The drop'));
      const dur = F?.duration ?? 1;
      const drop = S.motion.dropTimeOverride ?? F?.dropTime ?? null;
      renderControls(
        container,
        [
          {
            kind: 'toggle',
            label: 'Hold back until the drop',
            get: () => S.motion.gate,
            set: (v) => (S.motion.gate = v),
            hint: 'Effects stay subtle through the intro, then let go the moment the track arrives.',
          },
          {
            kind: 'slider',
            label: 'Kick-in moment',
            min: 0,
            max: dur,
            step: 0.1,
            get: () => drop ?? 0,
            set: (v) => (S.motion.dropTimeOverride = v),
            format: fmtTime,
            hint: drop == null ? 'Not detected in this track — set it by hand if you want a gated build-up.' : undefined,
          },
        ],
        () => app.changed(),
      );
      if (S.motion.dropTimeOverride != null || F?.dropTime != null) {
        renderControls(
          container,
          [
            {
              kind: 'button',
              label: 'Reset to auto-detected',
              variant: 'ghost',
              onClick: () => {
                S.motion.dropTimeOverride = null;
                app.rebuild();
                app.changed();
              },
            },
          ],
          () => app.changed(),
        );
      }
    },
  },
  {
    id: 'particles',
    label: 'Bokeh',
    icon: ICONS.particles,
    build(container, app) {
      const S = app.settings;
      container.appendChild(el('div', 'panel-title', 'Floating bokeh'));
      renderControls(
        container,
        [
          { kind: 'slider', label: 'Count', min: 0, max: 240, step: 5, get: () => S.particles.count, set: (v) => (S.particles.count = v), format: (v) => String(v) },
          { kind: 'slider', label: 'Size', min: 0.3, max: 2, step: 0.05, get: () => S.particles.size, set: (v) => (S.particles.size = v), format: (v) => `${v.toFixed(2)}×` },
          { kind: 'slider', label: 'Rise speed', min: 0.2, max: 2, step: 0.05, get: () => S.particles.speed, set: (v) => (S.particles.speed = v), format: (v) => `${v.toFixed(2)}×` },
          { kind: 'slider', label: 'Wind', min: -1, max: 1, step: 0.02, get: () => S.particles.wind, set: (v) => (S.particles.wind = v), format: wind },
          { kind: 'slider', label: 'Twinkle', min: 0, max: 1, step: 0.01, get: () => S.particles.twinkle, set: (v) => (S.particles.twinkle = v), format: pct },
          { kind: 'slider', label: 'Reactivity', min: 0, max: 1, step: 0.01, get: () => S.particles.reactivity, set: (v) => (S.particles.reactivity = v), format: pct, hint: 'Brightens and multiplies with the highs and hats.' },
        ],
        () => app.changed(),
      );
    },
  },
  {
    id: 'spectrum',
    label: 'Spectrum',
    icon: ICONS.spectrum,
    build(container, app) {
      const S = app.settings;
      container.appendChild(el('div', 'panel-title', 'Spectrum'));
      renderControls(
        container,
        [
          {
            kind: 'segmented',
            label: 'Style',
            options: [
              { value: 'off', label: 'Off' },
              { value: 'bars', label: 'Bars' },
              { value: 'ring', label: 'Ring' },
              { value: 'mirror', label: 'Mirror' },
            ],
            get: () => S.spectrum.style,
            set: (v) => (S.spectrum.style = v as typeof S.spectrum.style),
          },
          { kind: 'slider', label: 'X position', min: 0, max: 1, step: 0.005, get: () => S.spectrum.x, set: (v) => (S.spectrum.x = v), format: pos },
          { kind: 'slider', label: S.spectrum.style === 'ring' ? 'Y center' : 'Baseline', min: 0.12, max: 1, step: 0.005, get: () => S.spectrum.y, set: (v) => (S.spectrum.y = v), format: pos },
          { kind: 'slider', label: 'Width', min: 0.15, max: 1, step: 0.01, get: () => S.spectrum.width, set: (v) => (S.spectrum.width = v), format: pct },
          { kind: 'slider', label: 'Bars', min: 16, max: 96, step: 1, get: () => S.spectrum.bars, set: (v) => (S.spectrum.bars = v), format: (v) => String(v) },
          { kind: 'slider', label: 'Height', min: 0.05, max: 0.4, step: 0.01, get: () => S.spectrum.height, set: (v) => (S.spectrum.height = v), format: (v) => pct(v * 2.5) },
          { kind: 'slider', label: 'Opacity', min: 0, max: 1, step: 0.01, get: () => S.spectrum.opacity, set: (v) => (S.spectrum.opacity = v), format: pct },
          { kind: 'toggle', label: 'Peak caps', get: () => S.spectrum.caps, set: (v) => (S.spectrum.caps = v), hint: 'Floating peak-hold markers above the bars.' },
          { kind: 'note', html: 'Or grab the spectrum on the preview and drag the whole thing anywhere.' },
        ],
        () => app.changed(),
      );
    },
  },
  {
    id: 'reveal',
    label: 'Reveal',
    icon: ICONS.reveal,
    build(container, app) {
      const S = app.settings;
      container.appendChild(el('div', 'panel-title', 'Opening reveal'));
      renderControls(
        container,
        [
          {
            kind: 'segmented',
            label: 'Style',
            options: [
              { value: 'shutter', label: 'Shutter' },
              { value: 'fade', label: 'Fade' },
              { value: 'bars', label: 'Curtains' },
            ],
            get: () => S.intro.style,
            set: (v) => (S.intro.style = v as typeof S.intro.style),
          },
          { kind: 'slider', label: 'Duration', min: 0.5, max: 6, step: 0.1, get: () => S.intro.duration, set: (v) => (S.intro.duration = v), format: sec },
        ],
        () => app.changed(),
      );
    },
  },
  {
    id: 'badge',
    label: 'Badge',
    icon: ICONS.badge,
    build(container, app) {
      const S = app.settings;
      container.appendChild(el('div', 'panel-title', 'Song badge'));
      renderControls(
        container,
        [
          { kind: 'toggle', label: 'Show badge', get: () => S.badge.enabled, set: (v) => (S.badge.enabled = v) },
          { kind: 'text', label: 'Title', placeholder: 'SONG TITLE', get: () => S.badge.title, set: (v) => (S.badge.title = v) },
          { kind: 'text', label: 'Subtitle', placeholder: 'ARTIST · LABEL', get: () => S.badge.subtitle, set: (v) => (S.badge.subtitle = v) },
          {
            kind: 'segmented',
            label: 'Corner preset',
            options: [
              { value: 'bl', label: '↙' },
              { value: 'br', label: '↘' },
              { value: 'tl', label: '↖' },
              { value: 'tr', label: '↗' },
            ],
            get: () => {
              const b = app.settings.badge;
              return `${b.y < 0.5 ? 't' : 'b'}${b.x < 0.5 ? 'l' : 'r'}`;
            },
            set: (v) => app.setBadgeCorner(v as 'bl' | 'br' | 'tl' | 'tr'),
          },
          { kind: 'slider', label: 'X position', min: 0, max: 1, step: 0.005, get: () => S.badge.x, set: (v) => (S.badge.x = v), format: pos },
          { kind: 'slider', label: 'Y position', min: 0, max: 1, step: 0.005, get: () => S.badge.y, set: (v) => (S.badge.y = v), format: pos },
          { kind: 'slider', label: 'Scale', min: 0.6, max: 1.6, step: 0.02, get: () => S.badge.scale, set: (v) => (S.badge.scale = v), format: (v) => `${v.toFixed(2)}×` },
          { kind: 'slider', label: 'Opacity', min: 0.2, max: 1, step: 0.01, get: () => S.badge.opacity, set: (v) => (S.badge.opacity = v), format: pct },
          { kind: 'slider', label: 'Auto-hide', min: 0, max: 30, step: 0.5, get: () => S.badge.autoHide, set: (v) => (S.badge.autoHide = v), format: (v) => (v === 0 ? 'off' : `${v.toFixed(1)} s`), hint: 'Fades the badge out this many seconds after it appears — nice for intros.' },
          {
            kind: 'file',
            label: app.logoName() ? `Logo — ${app.logoName()}` : 'Logo',
            accept: 'image/*',
            button: app.logoName() ? 'Replace…' : 'Upload logo…',
            onFile: (f) => app.loadLogo(f),
            hint: 'Square images look best. Without one, a bolt icon fills in.',
          },
        ],
        () => app.changed(),
      );
      if (app.logoName()) {
        renderControls(
          container,
          [{ kind: 'button', label: 'Remove logo', variant: 'ghost', onClick: () => app.clearLogo() }],
          () => app.changed(),
        );
      }
      renderControls(
        container,
        [{ kind: 'note', html: 'Or grab the badge on the preview and place it exactly where you want it.' }],
        () => app.changed(),
      );
    },
  },
  {
    id: 'export',
    label: 'Export',
    icon: ICONS.export,
    build(container, app) {
      const S = app.settings;
      const F = app.features();
      container.appendChild(el('div', 'panel-title', 'Render the video'));

      if (app.exportState.running) {
        const bar = el('div', 'progress');
        const fill = el('div', 'progress-fill');
        bar.appendChild(fill);
        container.appendChild(bar);
        const label = el('div', 'note', app.exportState.label);
        container.appendChild(label);
        app.onExportProgress = (f, text) => {
          fill.style.width = `${Math.round(f * 100)}%`;
          label.textContent = text;
        };
        renderControls(
          container,
          [{ kind: 'button', label: 'Cancel', variant: 'danger', onClick: () => app.cancelExport() }],
          () => app.changed(),
        );
        return;
      }
      app.onExportProgress = null;

      if (!app.hasAudio()) {
        container.appendChild(el('div', 'note', 'Load a track first — you render what you hear.'));
        return;
      }

      const dur = F?.duration ?? 1;
      const trimStart = Math.min(S.exportCfg.trimStart, dur - 1);
      const trimEnd = S.exportCfg.trimEnd ?? dur;
      const frames = Math.round((trimEnd - trimStart) * S.exportCfg.fps);

      renderControls(
        container,
        [
          {
            kind: 'segmented',
            label: 'Resolution',
            options: [
              { value: '1280', label: '720p' },
              { value: '1920', label: '1080p' },
            ],
            get: () => String(S.exportCfg.width),
            set: (v) => {
              S.exportCfg.width = parseInt(v, 10);
              S.exportCfg.height = Math.round((S.exportCfg.width * 9) / 16);
            },
          },
          {
            kind: 'segmented',
            label: 'Frame rate',
            options: [
              { value: '24', label: '24' },
              { value: '30', label: '30' },
              { value: '60', label: '60' },
            ],
            get: () => String(S.exportCfg.fps),
            set: (v) => (S.exportCfg.fps = parseInt(v, 10)),
          },
          {
            kind: 'segmented',
            label: 'Quality',
            options: [
              { value: 'low', label: 'Small' },
              { value: 'medium', label: 'Balanced' },
              { value: 'high', label: 'Best' },
            ],
            get: () => S.exportCfg.quality,
            set: (v) => (S.exportCfg.quality = v as typeof S.exportCfg.quality),
          },
          { kind: 'slider', label: 'Start at', min: 0, max: Math.max(0, dur - 1), step: 0.1, get: () => trimStart, set: (v) => (S.exportCfg.trimStart = v), format: fmtTime },
          { kind: 'slider', label: 'End at', min: 1, max: dur, step: 0.1, get: () => trimEnd, set: (v) => (S.exportCfg.trimEnd = v), format: fmtTime },
          {
            kind: 'note',
            html: `Renders <b>${fmtTime(trimStart)} → ${fmtTime(trimEnd)}</b> · ${frames} frames${
              canUseWebCodecs() ? ' · <b>MP4</b> (H.264 + AAC), frame-exact' : ' · <b>WebM</b> via realtime capture (use Chrome for MP4)'
            }.`,
          },
          { kind: 'button', label: 'Export video', variant: 'primary', onClick: () => app.startExport() },
          { kind: 'button', label: 'Save poster (PNG)', variant: 'ghost', onClick: () => app.savePoster() },
        ],
        () => app.changed(),
      );

      if (app.lastExport) {
        const { filename, size, mode } = app.lastExport;
        container.appendChild(
          el('div', 'note', `Last render: ${filename} · ${fmtBytes(size)} · ${mode === 'webcodecs' ? 'MP4' : 'WebM'} — check your downloads.`),
        );
      }
    },
  },
];

export function buildChips(nav: HTMLElement, activeId: string, onPick: (id: string) => void): void {
  nav.innerHTML = '';
  for (const p of PANELS) {
    const chip = el('button', 'chip');
    chip.type = 'button';
    chip.title = p.label;
    if (p.id === activeId) chip.classList.add('active');
    chip.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p.icon}</svg><span>${p.label}</span>`;
    chip.addEventListener('click', () => onPick(p.id));
    nav.appendChild(chip);
  }
}

export function buildPanel(container: HTMLElement, id: string, app: PanelApp): void {
  container.innerHTML = '';
  const p = PANELS.find((x) => x.id === id) ?? PANELS[0];
  p.build(container, app);
}
