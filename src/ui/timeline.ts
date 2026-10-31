/**
 * Timeline: waveform, beat ticks, trim region, playhead. Click or drag to scrub.
 */

import type { AudioFeatures } from '../engine/analysis';
import { resolvePalette } from '../engine/palette';
import type { ProjectSettings } from '../state';
import { hexToRgb } from '../engine/layers';
import { fmtTime } from './controls';

export interface TimelineApp {
  features(): AudioFeatures | null;
  settings: ProjectSettings;
  getTime(): number;
  seek(t: number): void;
}

export class Timeline {
  private canvas: HTMLCanvasElement;
  private app: TimelineApp;
  private dragging = false;

  constructor(canvas: HTMLCanvasElement, app: TimelineApp) {
    this.canvas = canvas;
    this.app = app;

    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      canvas.setPointerCapture(e.pointerId);
      this.scrub(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) this.scrub(e);
    });
    canvas.addEventListener('pointerup', () => {
      this.dragging = false;
    });
  }

  private scrub(e: PointerEvent): void {
    const F = this.app.features();
    if (!F) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.app.seek(x * F.duration);
  }

  draw(): void {
    const { canvas } = this;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const F = this.app.features();
    const S = this.app.settings;
    const pal = resolvePalette(S.grade.preset, S.grade.custom);

    ctx.fillStyle = '#0c0f17';
    ctx.fillRect(0, 0, w, h);

    if (!F) {
      ctx.fillStyle = 'rgba(148,160,184,0.5)';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('The waveform appears once a track is loaded', w / 2, h / 2 + 4);
      ctx.textAlign = 'left';
      return;
    }

    // trim region shading
    const trimStart = Math.min(S.exportCfg.trimStart, F.duration - 0.5);
    const trimEnd = S.exportCfg.trimEnd ?? F.duration;
    const x0 = (trimStart / F.duration) * w;
    const x1 = (trimEnd / F.duration) * w;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, x0, h);
    ctx.fillRect(x1, 0, w - x1, h);

    // waveform
    const mid = h * 0.5;
    const [ar, ag, ab] = hexToRgb(pal.accent);
    const [a2r, a2g, a2b] = hexToRgb(pal.accent2);
    const px = Math.max(1, Math.floor(w));
    for (let x = 0; x < px; x++) {
      const f0 = Math.floor((x / w) * F.frames);
      const f1 = Math.max(f0 + 1, Math.floor(((x + 1) / w) * F.frames));
      let peak = 0;
      for (let f = f0; f < f1 && f < F.frames; f++) peak = Math.max(peak, F.rms[f] ?? 0);
      const k = x / w;
      const amp = Math.pow(peak, 0.75) * (h * 0.44);
      ctx.fillStyle = `rgba(${Math.round(ar + (a2r - ar) * k)},${Math.round(ag + (a2g - ag) * k)},${Math.round(ab + (a2b - ab) * k)},0.85)`;
      ctx.fillRect(x, mid - amp, 1, amp * 2 || 1);
    }

    // beat ticks
    if (F.beats.length > 0) {
      for (const b of F.beats) {
        const x = (b.t / F.duration) * w;
        ctx.fillStyle = b.downbeat ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)';
        ctx.fillRect(x, h - (b.downbeat ? 10 : 6), 1, b.downbeat ? 10 : 6);
      }
    }

    // drop marker
    const drop = S.motion.dropTimeOverride ?? F.dropTime;
    if (drop != null) {
      const x = (drop / F.duration) * w;
      ctx.strokeStyle = 'rgba(255,214,102,0.8)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x, h - 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // playhead
    const t = this.app.getTime();
    const px2 = (t / F.duration) * w;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px2 - 1, 0, 2, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(px2 - 4, 0, 8, h);

    // trim handles text
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(148,160,184,0.8)';
    ctx.fillText(fmtTime(trimStart), x0 + 4, 11);
    const endLabel = fmtTime(trimEnd);
    ctx.fillText(endLabel, Math.min(x1 - 4 - ctx.measureText(endLabel).width, w - ctx.measureText(endLabel).width - 2), 11);
  }
}
