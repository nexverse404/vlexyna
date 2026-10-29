/* Vlexyna — templates.js — ready-made project templates */
'use strict';
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
})();
