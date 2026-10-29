/* Vlexyna — templates.js — ready-made project templates */
'use strict';
import { VX, U } from './util.js';
(() => {
  const T = VX.templates = { list: [] };

  const mk = (type, over) => {
    const l = VX.layers.make(type);
    if (!l) return null;
    over = over || {};
    for (const k of ['name', 'x', 'y', 'scale', 'rotation', 'opacity', 'blend', 'mirror', 'start', 'end', 'auto'])
      if (over[k] !== undefined) l[k] = JSON.parse(JSON.stringify(over[k]));
    if (over.props) Object.assign(l.props, over.props);
    if (over.fx) l.fx = over.fx.map(f => ({ ...f, params: { ...f.params } }));
    return l;
  };
  const FXm = (id, params) => ({ id, enabled: true, params: { ...(VX.fx.defaults(VX.fx.byId[id]) || {}), ...(params || {}) } });

  T.add = (t) => { t.id = t.id || U.uid(); T.list.push(t); };
  T.apply = (t) => {
    const proj = VX.project.current;
    const app = VX.app || { playing: false, pause() { }, play() { } };
    const wasPlaying = app.playing;
    app.pause();
    proj.layers = t.layers.map(l => mk(l.type, l)).filter(Boolean);
    proj.post = (t.post || []).map(f => ({ ...f, params: { ...f.params } }));
    proj.camera = { on: false, zoom: 1, x: 0, y: 0, rot: 0, zoomBass: 0, zoomBeat: 0, rotBeat: 0, shake: 0, shakeBeat: 0, rotShake: 1, ...(t.camera || {}) };
    if (t.vars) proj.vars = { ...t.vars };
    proj.name = proj.name === 'Untitled' ? t.name : proj.name;
    VX.project.snapshot('template: ' + t.name);
    VX.ui && VX.ui.refreshAll();
    if (wasPlaying) app.play();
    U.toast(`Template applied — ${t.name}`);
  };

  /* ============ templates ============ */

  T.add({
    name: 'Trap Nation', desc: 'Radial spectrum around cover art — the classic',
    grad: ['#22d3ee', '#7c5cff'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#05060c', c2: '#101228', vign: .55 } },
      { type: 'particles', props: { count: 70, size: 4, c1: '#22d3ee', c2: '#7c5cff', speed: 26, glow: 14, twinkle: .7, beatBurst: .35 }, y: .5 },
      { type: 'image', name: 'Cover art', props: { size: .42, circle: true, pulse: .1, shadow: 40 } },
      { type: 'spectrum', props: { mode: 'radial', count: 130, radius: .245, height: .3, barWidth: .5, c1: '#22d3ee', c2: '#a855f7', glow: 26, curve: .72, alphaFloor: .3 }, auto: { spin: { src: 'level', amt: .12 } } },
      { type: 'text', name: 'Title', y: .88, props: { text: 'ARTIST — TRACK', size: 3.4, weight: 800, c1: '#e8ecff', letterSpacing: 6, shadowBlur: 24, anim: 'pulse', animAmt: .6 } },
    ],
    post: [FXm('glow', { radius: 10, intensity: .18 })],
  });

  T.add({
    name: 'Neon Wave', desc: 'Plasma glow with mirrored bass bars',
    grad: ['#7c5cff', '#22d3ee'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#0a0714', c2: '#1c0f38', vign: .4 } },
      { type: 'plasma', props: { c1: '#2a1260', c2: '#0e7490', c3: '#7c3aed', style: 'aurora', scale: 2.2, speed: .35, mix: .5 } },
      { type: 'spectrum', y: .78, props: { mode: 'mirror', count: 80, barWidth: .45, height: .42, c1: '#22d3ee', c2: '#c084fc', glow: 30, curve: .75 } },
      { type: 'wave', y: .78, props: { style: 'line', amplitude: .09, c1: '#e0f2fe', c2: '#22d3ee', thickness: 4, glow: 24 } },
      { type: 'text', y: .3, props: { text: 'NEON WAVE', size: 10, weight: 900, gradient: true, c1: '#22d3ee', c2: '#a855f7', letterSpacing: 10, shadowBlur: 40, anim: 'pulse', animAmt: .5 } },
      { type: 'progress', y: .95, props: {} },
    ],
    post: [FXm('vignette', { strength: .4 })],
  });

  T.add({
    name: 'Synthdrive', desc: 'Retro grid, sun and stars',
    grad: ['#f472b6', '#fbbf24'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#160b2e', c2: '#3b1252', vign: .5 } },
      { type: 'starfield', props: { count: 220, speed: 90, warp: 2.4, c1: '#ffe3f1', c2: '#f9a8d4', glow: 10 } },
      { type: 'grid', props: { horizon: .6, lineColor: '#f472b6', sun: true, sunColor: '#fb923c', sunSize: .34, sunStripes: 5, glow: 16, speed: 1.4 } },
      { type: 'wave', y: .45, props: { style: 'dualcircle', amplitude: .16, c1: '#fbbf24', c2: '#f472b6', thickness: 5, glow: 26 } },
      { type: 'text', y: .18, props: { text: 'SYNTH DRIVE', size: 8, weight: 900, font: 'Impact, Charcoal, sans-serif', c1: '#fde68a', letterSpacing: 8, shadowBlur: 30, anim: 'beat', animAmt: .8 } },
    ],
    post: [FXm('scanlines', { spacing: 4, intensity: .12 }), FXm('vignette', { strength: .45 })],
  });

  T.add({
    name: 'Cosmic Tunnel', desc: 'Fly through infinite rings',
    grad: ['#22d3ee', '#312e81'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#02030a', c2: '#0a0f2e', vign: .6 } },
      { type: 'tunnel', props: { rings: 22, speed: .3, c1: '#22d3ee', c2: '#4c1d95', glow: 18, twist: 2.4, beatZoom: .7 } },
      { type: 'orbs', props: { count: 10, c1: '#22d3ee', c2: '#7c5cff', c3: '#f0abfc', alpha: .35, bassSwell: .8 } },
      { type: 'spectrum', props: { mode: 'radial', count: 90, radius: .1, height: .16, barWidth: .35, c1: '#67e8f9', c2: '#c4b5fd', glow: 18, curve: .8 } },
      { type: 'text', y: .82, props: { text: 'COSMIC', size: 7, weight: 900, c1: '#e0e7ff', letterSpacing: 14, shadowBlur: 34, anim: 'float', animAmt: .6 } },
    ],
  });

  T.add({
    name: 'Party Pop', desc: 'Confetti, beat rings, bold colors',
    grad: ['#f43f5e', '#fbbf24'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#170a23', c2: '#2d0b3a', vign: .35 } },
      { type: 'confetti', props: { count: 130, gravity: 300, beatBurst: .9 } },
      { type: 'rings', props: { speed: 700, c1: '#fbbf24', c2: '#f43f5e', thickness: 7, glow: 20, maxRings: 10 } },
      { type: 'spectrum', y: .8, props: { mode: 'bars', count: 56, barWidth: .75, height: .45, c1: '#fb7185', c2: '#fbbf24', glow: 24, rounded: true, curve: .8 } },
      { type: 'text', y: .35, props: { text: 'PARTY\nMODE', size: 13, weight: 900, gradient: true, c1: '#fbbf24', c2: '#f43f5e', letterSpacing: 4, anim: 'beat', animAmt: 1 } },
    ],
  });

  T.add({
    name: 'Minimal Studio', desc: 'Clean podcast / cover style',
    grad: ['#1f2937', '#9ca3af'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#111318', c2: '#1c2028', vign: .3 } },
      { type: 'image', name: 'Cover art', y: .42, props: { size: .4, fit: 'cover' } },
      { type: 'spectrum', y: .88, props: { mode: 'bars', count: 64, barWidth: .22, height: .09, solid: true, c1: '#8b93a7', glow: 0, rounded: true, curve: .9 } },
      { type: 'text', y: .73, props: { text: 'Track title', size: 4.2, weight: 600, c1: '#e8ecf4', anim: 'none', shadowBlur: 8 } },
      { type: 'progress', y: .965, props: { width: .4, style: 'line' } },
    ],
  });

  T.add({
    name: 'Lyric Focus', desc: 'Centered animated lyrics',
    grad: ['#a855f7', '#22d3ee'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#080a12', c2: '#141a2e', vign: .5 } },
      { type: 'plasma', props: { c1: '#1e1b4b', c2: '#164e63', c3: '#4c1d95', style: 'aurora', mix: .35, speed: .25 } },
      { type: 'wave', y: .9, props: { style: 'line', amplitude: .05, c1: '#334155', c2: '#475569', thickness: 2, glow: 0 } },
      { type: 'lyrics', name: 'Lyrics', props: { size: 6, c1: '#f1f5f9', style: 'pop', popAmt: .22, showNext: true, shadowBlur: 26 } },
    ],
    post: [FXm('vignette', { strength: .5 })],
  });

  T.add({
    name: 'Aurora Chill', desc: 'Soft bokeh and gentle waves',
    grad: ['#34d399', '#818cf8'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#04121a', c2: '#0b1e2e', vign: .45 } },
      { type: 'plasma', props: { c1: '#065f6b', c2: '#065f46', c3: '#312e81', style: 'plasma', scale: 2, speed: .3, mix: .55 } },
      { type: 'orbs', props: { count: 16, c1: '#34d399', c2: '#818cf8', c3: '#f0abfc', alpha: .3, speed: 8, bassSwell: .7 } },
      { type: 'wave', y: .62, props: { style: 'fill', amplitude: .12, c1: '#34d399', c2: '#818cf8', thickness: 3, glow: 18 } },
      { type: 'text', y: .3, props: { text: 'aurora', size: 6.5, weight: 300, italic: true, c1: '#d1fae5', letterSpacing: 16, anim: 'float', animAmt: .5, shadowBlur: 20 } },
    ],
  });

  T.add({
    name: 'Fire Bars', desc: 'Burning mirrored spectrum',
    grad: ['#fde047', '#dc2626'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#0d0505', c2: '#1f0a05', vign: .6 } },
      { type: 'particles', y: .75, props: { count: 160, size: 4.5, c1: '#fbbf24', c2: '#dc2626', direction: 'up', speed: 110, glow: 16, twinkle: .8, beatBurst: .8, bassScale: .8 } },
      { type: 'spectrum', y: .72, props: { mode: 'mirror', count: 96, barWidth: .8, rounded: false, height: .5, c1: '#fde047', c2: '#dc2626', glow: 34, curve: .68 } },
      { type: 'text', y: .16, props: { text: 'ON FIRE', size: 9, weight: 900, c1: '#fde68a', letterSpacing: 10, anim: 'beat', animAmt: .7, shadowBlur: 40 } },
    ],
    post: [FXm('gradmap', { shadow: '#180a02', mid: '#b45309', high: '#fef3c7', mix: .35 })],
  });

  T.add({
    name: 'LED Wall', desc: 'Retro LED block spectrum',
    grad: ['#22c55e', '#ef4444'],
    layers: [
      { type: 'background', props: { mode: 'color', color: '#050505' } },
      { type: 'spectrum', y: .5, props: { mode: 'blocks', count: 36, barWidth: .8, cap: 30, height: .62, c1: '#22c55e', c2: '#ef4444', glow: 10, curve: .85 } },
      { type: 'text', y: .14, props: { text: 'LED SPECTRUM', size: 5, weight: 900, c1: '#22c55e', letterSpacing: 12, shadowBlur: 20, anim: 'typewriter', animAmt: 1.2 } },
    ],
    post: [FXm('scanlines', { spacing: 5, intensity: .2 })],
  });

  T.add({
    name: 'Beat Rings', desc: 'Ripples on every kick',
    grad: ['#22d3ee', '#f472b6'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#04060c', c2: '#0b1020', vign: .55 } },
      { type: 'starfield', props: { count: 160, speed: 30, warp: .8, c1: '#94a3b8', c2: '#e2e8f0' } },
      { type: 'rings', props: { speed: 560, c1: '#22d3ee', c2: '#f472b6', thickness: 4, decay: .9, maxRings: 14, glow: 22 } },
      { type: 'shape', props: { shape: 'circle', w: .06, h: .06, fill: '#22d3ee', strokeWidth: 0, pulse: .8, glow: 26 } },
      { type: 'progress', y: .93, props: { width: .5, style: 'dots' } },
    ],
  });

  T.add({
    name: 'Retro Sun', desc: 'Vaporwave sunset stripes',
    grad: ['#f9a8d4', '#67e8f9'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#2b1055', c2: '#7597de', vign: .3 } },
      { type: 'grid', props: { horizon: .58, lineColor: '#f9a8d4', sun: true, sunColor: '#ffd6f5', sunSize: .3, sunStripes: 6, glow: 12, speed: 1, bgColor: '#150a2e' } },
      { type: 'starfield', props: { count: 120, speed: 18, warp: 0, c1: '#fef9ff', c2: '#e9d5ff' } },
      { type: 'wave', y: .5, props: { style: 'mirror', amplitude: .1, c1: '#67e8f9', c2: '#f9a8d4', thickness: 3, glow: 18 } },
      { type: 'text', y: .2, props: { text: 'ＶＡＰＯＲ', size: 7, weight: 400, c1: '#fdf4ff', letterSpacing: 6, shadowBlur: 26, anim: 'float', animAmt: .4 } },
    ],
    post: [FXm('channelshift', { offsetX: 4 }), FXm('scanlines', { spacing: 6, intensity: .1 })],
  });

  T.add({
    name: 'Logo Pulse', desc: 'Big artwork with bass kick',
    grad: ['#7c5cff', '#f43f5e'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#060609', c2: '#151022', vign: .55 } },
      { type: 'orbs', props: { count: 8, c1: '#7c5cff', c2: '#f43f5e', c3: '#38bdf8', alpha: .28, bassSwell: 1 } },
      { type: 'rings', props: { speed: 480, c1: '#7c5cff', c2: '#f43f5e', thickness: 3, decay: 1.4, glow: 18, maxRings: 8 } },
      { type: 'image', name: 'Cover art', props: { size: .55, circle: true, pulse: .22, shadow: 60 } },
      { type: 'text', y: .87, props: { text: 'ARTIST NAME', size: 3, weight: 600, c1: '#cdd3e6', letterSpacing: 14, anim: 'pulse', animAmt: .4 } },
    ],
  });

  T.add({
    name: 'Waveform Cast', desc: 'Huge centered waveform',
    grad: ['#38bdf8', '#818cf8'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#07090f', c2: '#0d1220', vign: .45 } },
      { type: 'wave', y: .5, props: { style: 'mirror', amplitude: .42, c1: '#38bdf8', c2: '#818cf8', thickness: 3, glow: 30, width: 1.2 } },
      { type: 'spectrum', y: .5, props: { mode: 'dots', count: 120, height: .5, c1: '#1e3a5f', c2: '#27324a', solid: true, glow: 0, dotSize: .5, alphaFloor: .9 } },
      { type: 'text', y: .09, props: { text: 'WAVEFORM', size: 3.2, weight: 800, c1: '#64748b', letterSpacing: 22, anim: 'none' } },
      { type: 'progress', y: .94, props: { width: .3, style: 'line', showTime: false } },
    ],
  });

  T.add({
    name: 'Glitch VHS', desc: 'RGB-split glitch aesthetic',
    grad: ['#ef4444', '#06b6d4'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#0a0a0f', c2: '#16161f', vign: .5 } },
      { type: 'spectrum', y: .8, props: { mode: 'bars', count: 64, barWidth: .9, rounded: false, height: .5, c1: '#06b6d4', c2: '#ef4444', glow: 20, curve: .75 } },
      { type: 'text', y: .38, props: { text: 'GLITCH', size: 12, weight: 900, c1: '#f8fafc', letterSpacing: 6, anim: 'beat', animAmt: .9 } },
      { type: 'grid', props: { horizon: .8, lineColor: '#1e293b', sun: false, glow: 0, lines: 8, vlines: 10, speed: .6 } },
    ],
    post: [FXm('channelshift', { offsetX: 10 }), FXm('scanlines', { spacing: 3, intensity: .28, speed: .6 }), FXm('grain', { amount: .18 })],
  });

  T.add({
    name: 'Blank', desc: 'Start from scratch', grad: ['#334155', '#64748b'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#0a0c12', c2: '#12151f', vign: .35 } },
    ],
  });
  /* two more showcase templates using the new layers/effects */
  T.add({
    name: 'Shader Lab', desc: 'GLSL shader + spectrum + lyrics',
    grad: ['#f472b6', '#22d3ee'],
    layers: [
      { type: 'shader', props: { quality: .75 } },
      { type: 'spectrum', y: .85, props: { mode: 'bars', count: 72, barWidth: .3, height: .3, c1: '#ffffff', c2: '#22d3ee', solid: false, glow: 20 } },
      { type: 'lyrics', y: .4, props: { size: 5, c1: '#ffffff', style: 'zoom', shadowBlur: 30 } },
    ],
    post: [FXm('vignette', { strength: .4 })],
  });

  T.add({
    name: 'Orbital', desc: 'Spherical field & 3D particles',
    grad: ['#22d3ee', '#7c5cff'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#03040a', c2: '#0b1024', vign: .6 } },
      { type: 'particles3d', props: { count: 320, speed: 1.6, c1: '#e0f7ff', c2: '#134e5e', glow: 14 } },
      { type: 'spherefield', props: { count: 800, radius: .26, c1: '#22d3ee', c2: '#f472b6', glow: 16, pulse: .8 } },
      { type: 'text', y: .85, props: { text: 'ORBITAL', size: 4, weight: 800, c1: '#dbe7ff', letterSpacing: 18, anim: 'float', animAmt: .4 } },
    ],
    post: [FXm('bloom', { threshold: .6, radius: 26, intensity: .8 })],
  });

  /* ═══════════ genre pack — the starting points creators actually look for ═══════════ */

  T.add({
    name: 'Hip-Hop Bars', desc: 'Bold boom-bap bars, gold on black',
    grad: ['#facc15', '#111111'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#050505', c2: '#17130a', vign: .5 } },
      { type: 'spectrum', y: .5, props: { mode: 'blocks', count: 42, barWidth: .85, height: .62, c1: '#facc15', c2: '#f97316', glow: 22, cap: 18, curve: .85, alphaFloor: .25 } },
      { type: 'text', y: .12, props: { text: 'HIP-HOP', size: 7, weight: 900, c1: '#f5f0e1', letterSpacing: 22, shadowBlur: 12, anim: 'pulse', animAmt: .3 } },
      { type: 'text', y: .9, props: { text: 'prod. by you', size: 2.2, weight: 400, c1: '#a1a1aa', letterSpacing: 8 } },
      { type: 'progress', y: .97, props: {} },
    ],
    post: [FXm('grain', { amount: .07 }), FXm('vignette', { strength: .5 })],
  });

  T.add({
    name: 'Lo-Fi Study', desc: 'Warm tape loop for chilled beats',
    grad: ['#fbbf24', '#78350f'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#1c1410', c2: '#2e2018', angle: 120, vign: .35 } },
      { type: 'plasma', props: { c1: '#78350f', c2: '#b45309', c3: '#166534', style: 'aurora', scale: 1.6, speed: .12, mix: .35, react: .3 } },
      { type: 'spectrum', y: .84, props: { mode: 'bars', count: 56, barWidth: .55, height: .16, c1: '#fbbf24', c2: '#f59e0b', glow: 12, curve: .9, alphaFloor: .2 } },
      { type: 'text', y: .2, props: { text: 'lo-fi beats', size: 4.4, weight: 600, c1: '#fde68a', letterSpacing: 10, shadowBlur: 18, anim: 'float', animAmt: .3 } },
      { type: 'lyrics', name: 'Lyrics', y: .58, props: { size: 4, c1: '#e7e5e4', style: 'fade', showNext: true, shadowBlur: 14 } },
    ],
    post: [FXm('grain', { amount: .12 }), FXm('scanlines', { intensity: .12 }), FXm('gradmap', { shadow: '#0c0a09', mid: '#a16207', high: '#fef3c7', mix: .22 })],
  });

  T.add({
    name: 'DnB Rush', desc: 'High-speed tunnel, acid green',
    grad: ['#a3e635', '#052e16'],
    layers: [
      { type: 'background', props: { mode: 'color', color: '#020403', vign: .6 } },
      { type: 'tunnel', props: { speed: 3.2, c1: '#a3e635', c2: '#065f46', glow: 20, rings: 26 } },
      { type: 'spectrum', y: .5, props: { mode: 'radial', count: 96, radius: .2, height: .24, barWidth: .4, c1: '#a3e635', c2: '#22d3ee', glow: 24, curve: .75, alphaFloor: .3 }, auto: { spin: { src: 'level', amt: .35 } } },
      { type: 'text', y: .86, props: { text: 'DNB RUSH', size: 4, weight: 800, c1: '#ecfccb', letterSpacing: 16, shadowBlur: 20, anim: 'pulse', animAmt: .5 } },
    ],
    post: [FXm('bloom', { threshold: .55, radius: 22, intensity: .7 })],
  });

  T.add({
    name: 'Metal Storm', desc: 'Crimson glitch assault',
    grad: ['#ef4444', '#0a0a0a'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#0a0505', c2: '#1c0808', vign: .6 } },
      { type: 'particles', props: { count: 140, size: 3, c1: '#ef4444', c2: '#f97316', speed: 140, glow: 10, twinkle: .2, beatBurst: .9 } },
      { type: 'spectrum', y: .5, props: { mode: 'mirror', count: 64, barWidth: .3, height: .7, c1: '#ef4444', c2: '#7f1d1d', glow: 26, curve: .8, alphaFloor: .2 } },
      { type: 'text', y: .14, props: { text: 'METAL', size: 9, weight: 900, c1: '#fecaca', letterSpacing: 26, shadowBlur: 30, anim: 'shake', animAmt: .35 } },
    ],
    post: [FXm('channelshift', { amount: .004 }), FXm('grain', { amount: .1 }), FXm('vignette', { strength: .55 })],
  });

  T.add({
    name: 'Jazz Club', desc: 'Late-night amber and velvet',
    grad: ['#f59e0b', '#312e81'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#100e1d', c2: '#1e1533', angle: 60, vign: .5 } },
      { type: 'orbs', props: { count: 14, c1: '#f59e0b', c2: '#a78bfa', c3: '#fbbf24', alpha: .3, speed: 5, bassSwell: .6 } },
      { type: 'wave', y: .68, props: { style: 'line', amplitude: .07, c1: '#fde68a', c2: '#f59e0b', thickness: 3, glow: 18 } },
      { type: 'spectrum', y: .68, props: { mode: 'bars', count: 36, barWidth: .35, height: .12, c1: '#a78bfa', c2: '#c4b5fd', glow: 10, curve: .95, alphaFloor: .25 } },
      { type: 'text', y: .3, props: { text: 'Blue Room', size: 6, weight: 600, c1: '#f5e6c8', letterSpacing: 4, shadowBlur: 26, anim: 'float', animAmt: .2, italic: true } },
      { type: 'text', y: .4, props: { text: 'live at midnight', size: 2, weight: 400, c1: '#a78bfa', letterSpacing: 12 } },
    ],
    post: [FXm('vignette', { strength: .6 }), FXm('grain', { amount: .06 })],
  });

  T.add({
    name: 'Ambient Drift', desc: 'Weightless pads, breathing light',
    grad: ['#67e8f9', '#818cf8'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#060913', c2: '#0d1330', angle: 200, vign: .3 } },
      { type: 'plasma', props: { c1: '#1e3a8a', c2: '#0e7490', c3: '#6d28d9', style: 'sweep', scale: 1.2, speed: .08, mix: .6, react: .35 } },
      { type: 'orbs', props: { count: 9, c1: '#67e8f9', c2: '#818cf8', c3: '#c4b5fd', alpha: .22, speed: 3, bassSwell: .4 } },
      { type: 'wave', y: .6, props: { style: 'fill', amplitude: .05, c1: '#67e8f9', c2: '#312e81', thickness: 2, glow: 14 } },
      { type: 'progress', y: .96, props: {} },
    ],
    post: [FXm('bloom', { threshold: .7, radius: 30, intensity: .5 })],
  });

  T.add({
    name: 'Podcast Pro', desc: 'Clean talk-show waveform card',
    grad: ['#e2e8f0', '#334155'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#111726', c2: '#1c2436', angle: 90, vign: .18 } },
      { type: 'shape', y: .5, props: { shape: 'rect', w: .62, h: .5, corner: .1, fill: '#0d1220ee', stroke: '#2c3a55', strokeWidth: 2, glow: 0 } },
      { type: 'wave', y: .52, props: { style: 'line', amplitude: .09, c1: '#94a3b8', c2: '#e2e8f0', thickness: 3, glow: 6 } },
      { type: 'text', y: .35, props: { text: 'EPISODE 042', size: 2.4, weight: 700, c1: '#e2e8f0', letterSpacing: 14 } },
      { type: 'text', y: .66, props: { text: 'The Craft of Sound', size: 3.2, weight: 600, c1: '#7dd3fc', letterSpacing: 2, shadowBlur: 10 } },
      { type: 'progress', y: .72, props: {} },
    ],
    post: [],
  });

  T.add({
    name: 'Dubstep Drop', desc: 'LED wall and impact shockwaves',
    grad: ['#22d3ee', '#e11d48'],
    layers: [
      { type: 'background', props: { mode: 'color', color: '#04050a', vign: .55 } },
      { type: 'spectrum', y: .5, props: { mode: 'blocks', count: 64, barWidth: .95, height: .55, c1: '#22d3ee', c2: '#e11d48', glow: 28, cap: 14, curve: .7, alphaFloor: .18 }, auto: { height: { src: 'beat', amt: .15 } } },
      { type: 'rings', props: { speed: 900, c1: '#22d3ee', c2: '#e11d48', thickness: 9, glow: 26, maxRings: 8 } },
      { type: 'text', y: .1, props: { text: 'DROP IT', size: 6.5, weight: 900, c1: '#fff', letterSpacing: 18, shadowBlur: 34, anim: 'pulse', animAmt: .8 } },
    ],
    post: [FXm('bloom', { threshold: .5, radius: 26, intensity: .9 }), FXm('vignette', { strength: .45 })],
  });

  T.add({
    name: 'Cinematic Trailer', desc: 'Slow push, god rays, tracking titles',
    grad: ['#cbd5e1', '#0f172a'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#05070c', c2: '#101726', angle: 160, vign: .65 } },
      { type: 'starfield', props: { count: 190, speed: 14, warp: .4, c1: '#64748b', c2: '#e2e8f0', glow: 6 } },
      { type: 'grid', props: { horizon: .82, lines: 8, vlines: 9, speed: .4, lineColor: '#1e293b', lineWidth: 1.4, glow: 4, sun: false, bg: true, bgColor: '#070a12', beatZoom: .15 } },
      { type: 'text', y: .42, props: { text: 'IN A WORLD OF SOUND', size: 3.4, weight: 300, c1: '#cbd5e1', letterSpacing: 30, anim: 'float', animAmt: .12 } },
      { type: 'text', y: .55, props: { text: 'VLEXYNA', size: 8, weight: 900, gradient: true, c1: '#e2e8f0', c2: '#7dd3fc', letterSpacing: 24, shadowBlur: 26 } },
    ],
    post: [FXm('vignette', { strength: .7 }), FXm('grain', { amount: .05 })],
  });

  T.add({
    name: 'K-Pop Sparkle', desc: 'Confetti pink, cyan ring energy',
    grad: ['#f472b6', '#22d3ee'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#180d1c', c2: '#0d1b2e', angle: 45, vign: .35 } },
      { type: 'confetti', props: { count: 120, size: 9, gravity: 150, flutter: 3, spin: 6, c1: '#f472b6', c2: '#22d3ee', c3: '#fde047', c4: '#a78bfa', c5: '#f9a8d4', beatBurst: 1.1, shape: 'mix' } },
      { type: 'spectrum', y: .5, props: { mode: 'radial', count: 110, radius: .24, height: .2, barWidth: .45, c1: '#f472b6', c2: '#22d3ee', glow: 26, curve: .8, alphaFloor: .3, rounded: true } },
      { type: 'image', name: 'Cover art', props: { size: .34, circle: true, pulse: .16, shadow: 36 } },
      { type: 'text', y: .88, props: { text: 'SHINE ON', size: 4.6, weight: 800, gradient: true, c1: '#f9a8d4', c2: '#22d3ee', letterSpacing: 14, shadowBlur: 28, anim: 'pulse', animAmt: .5 } },
    ],
    post: [FXm('bloom', { threshold: .62, radius: 24, intensity: .75 })],
  });

  T.add({
    name: 'Reggaeton Heat', desc: 'Neon tropics, big cover pulse',
    grad: ['#fb923c', '#ec4899'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#1a0b2e', c2: '#3b0d2f', angle: 135, vign: .45 } },
      { type: 'orbs', props: { count: 12, c1: '#fb923c', c2: '#ec4899', c3: '#fbbf24', alpha: .3, speed: 9, bassSwell: .9 } },
      { type: 'rings', props: { speed: 520, c1: '#fb923c', c2: '#ec4899', thickness: 6, glow: 18, maxRings: 7 } },
      { type: 'image', name: 'Cover art', props: { size: .4, circle: true, pulse: .3, shadow: 44 } },
      { type: 'spectrum', y: .87, props: { mode: 'mirror', count: 72, barWidth: .5, height: .18, c1: '#fb923c', c2: '#ec4899', glow: 20, curve: .85, alphaFloor: .25 } },
      { type: 'text', y: .12, props: { text: 'FUEGO', size: 5.5, weight: 900, c1: '#ffedd5', letterSpacing: 20, shadowBlur: 26, anim: 'pulse', animAmt: .4 } },
    ],
    post: [FXm('bloom', { threshold: .58, radius: 20, intensity: .6 }), FXm('vignette', { strength: .4 })],
  });

  T.add({
    name: 'Gospel Light', desc: 'Golden haze and soft rays',
    grad: ['#fde68a', '#ffffff'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#141007', c2: '#2b2410', angle: 110, vign: .4 } },
      { type: 'plasma', props: { c1: '#92400e', c2: '#fbbf24', c3: '#fef3c7', style: 'aurora', scale: 1.8, speed: .16, mix: .4, react: .4 } },
      { type: 'orbs', props: { count: 16, c1: '#fde68a', c2: '#f59e0b', c3: '#fff7ed', alpha: .26, speed: 4, bassSwell: .5 } },
      { type: 'spectrum', y: .5, props: { mode: 'radial', count: 90, radius: .3, height: .14, barWidth: .35, c1: '#fef3c7', c2: '#f59e0b', glow: 18, curve: .9, alphaFloor: .3, rounded: true } },
      { type: 'text', y: .82, props: { text: 'AMAZING', size: 5, weight: 800, c1: '#fffbeb', letterSpacing: 18, shadowBlur: 30, anim: 'float', animAmt: .2 } },
    ],
    post: [FXm('bloom', { threshold: .68, radius: 28, intensity: .65 }), FXm('gradmap', { shadow: '#181104', mid: '#b45309', high: '#fffbeb', mix: .18 })],
  });

  /* ═══════════ edit recipes — bars + animated video + branding + reactive camera ═══════════ */

  T.add({
    name: 'Bass Boost Edit', desc: 'Mirror bars, center video, camera punch — the classic edit',
    grad: ['#f43f5e', '#fbbf24'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#05060a', c2: '#12081a', vign: .55 } },
      { type: 'spectrum', y: .5, props: { mode: 'mirror', count: 96, barWidth: .38, height: .78, c1: '#f43f5e', c2: '#fbbf24', glow: 30, curve: .78, alphaFloor: .16 }, auto: { height: { src: 'beat', amt: .06 } } },
      { type: 'video', name: 'Center video', props: { size: .58, fit: 'cover', pulse: .12, circle: false, shadow: 40 } },
      { type: 'text', name: 'Brand', x: .16, y: .12, props: { text: 'YOUR BRAND', size: 2.6, weight: 800, c1: '#f8fafc', letterSpacing: 10, shadowBlur: 16, anim: 'pulse', animAmt: .25 } },
      { type: 'text', name: 'Handle', x: .84, y: .92, props: { text: '@yourhandle', size: 1.8, weight: 600, c1: '#fbbf24', letterSpacing: 6 } },
      { type: 'progress', y: .97, props: {} },
    ],
    camera: { on: true, zoom: 1.04, zoomBass: .025, zoomBeat: .05, shakeBeat: .35, rotShake: .8 },
    post: [FXm('glow', { radius: 9, intensity: .16 }), FXm('vignette', { strength: .5 })],
  });

  T.add({
    name: 'Magic Shivers', desc: 'Radial bar ring around the clip, breathing zoom',
    grad: ['#22d3ee', '#a78bfa'],
    layers: [
      { type: 'background', props: { mode: 'gradient', c1: '#02030a', c2: '#0a1026', angle: 200, vign: .5 } },
      { type: 'particles', props: { count: 60, size: 3, c1: '#22d3ee', c2: '#a78bfa', speed: 18, glow: 12, twinkle: .8, beatBurst: .5 } },
      { type: 'spectrum', y: .5, props: { mode: 'radial', count: 120, radius: .27, height: .22, barWidth: .42, c1: '#22d3ee', c2: '#a78bfa', glow: 26, curve: .8, alphaFloor: .25 }, auto: { spin: { src: 'level', amt: .1 } } },
      { type: 'video', name: 'Center video', props: { size: .5, fit: 'cover', pulse: .08, circle: true, shadow: 44 } },
      { type: 'text', name: 'Brand', x: .5, y: .09, props: { text: 'MAGIC SHIVERS', size: 3.2, weight: 900, gradient: true, c1: '#22d3ee', c2: '#a78bfa', letterSpacing: 22, shadowBlur: 26, anim: 'pulse', animAmt: .3 } },
      { type: 'text', name: 'Track', x: .5, y: .93, props: { text: '{title} — {artist}', size: 2, weight: 600, c1: '#cbd5e1', letterSpacing: 6 } },
    ],
    camera: { on: true, zoom: 1.08, zoomBass: .05, zoomBeat: .03, rotBeat: .4, shakeBeat: .18, rotShake: .5 },
    post: [FXm('bloom', { threshold: .6, radius: 22, intensity: .7 }), FXm('vignette', { strength: .45 })],
  });

  /* ═══════════ community: your own template library (local remix flow) ═══════════ */
  const LS_KEY = 'vlexyna_templates_v1';
  T.saveCustom = (name) => {
    const proj = VX.project && VX.project.current;
    if (!proj || !proj.layers.length) { U.toast('Nothing to save — add some layers first', 'warn'); return null; }
    const strip = (k, v) => (k.startsWith('_') && k !== '_seed') ? undefined : v;
    const t = {
      name: (name || proj.name || 'My template').slice(0, 40), desc: 'Your template', custom: true,
      grad: ['#7c6cf0', '#22d3ee'],
      layers: JSON.parse(JSON.stringify(proj.layers, strip)).map(l => {
        delete l.id; delete l.start; delete l.end; delete l.locked; delete l.collapsed;
        l.fx = (l.fx || []).map(f => ({ id: f.id, enabled: f.enabled !== false, params: f.params }));
        return l;
      }),
      post: JSON.parse(JSON.stringify(proj.post || [], strip)),
    };
    const lib = T.customList();
    const i = lib.findIndex(x => x.name === t.name);
    if (i >= 0) lib[i] = t; else lib.push(t);
    try { localStorage.setItem(LS_KEY, JSON.stringify(lib)); } catch (e) { U.toast('Could not save template (storage full?)', 'err'); return null; }
    T._reloadCustom();
    U.toast(`Template “${t.name}” saved — ${t.layers.length} layers`);
    return t;
  };
  T.customList = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  };
  T.removeCustom = (name) => {
    const lib = T.customList().filter(t => t.name !== name);
    localStorage.setItem(LS_KEY, JSON.stringify(lib));
    T._reloadCustom();
  };
  T._reloadCustom = () => {
    for (let i = T.list.length - 1; i >= 0; i--) if (T.list[i].custom) T.list.splice(i, 1);
    for (const t of T.customList()) { t.custom = true; T.add(t); }
  };
  T._reloadCustom();
})();