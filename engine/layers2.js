/* Vlexyna — layers2.js — Shader (GLSL), 3D Particles, Spherical Field */
'use strict';
import { VX, U } from './util.js';
import { P } from './params.js';

(() => {
  const L = VX.layers;
  const clamp = U.clamp;

  /* ═════════ SHADER (GLSL) ═════════ */
  const SHADER_HEADER = `precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uLevel;
uniform float uBeat;
uniform sampler2D uSpectrum;
`;

  const SHADER_PRESETS = {
    'Neon Plasma': `void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * 2.0 - 1.0;
  float t = uTime * (0.4 + uBass * 0.8);
  float v = sin(p.x * 3.0 + t) + sin(p.y * 3.0 - t * 1.2)
          + sin((p.x + p.y) * 2.0 + t * 0.7)
          + sin(length(p) * 5.0 - t * 1.5);
  vec3 a = vec3(0.12, 0.05, 0.3), b = vec3(0.05, 0.6, 0.7), c = vec3(0.95, 0.3, 0.7);
  vec3 col = v < 0.0 ? mix(a, b, v * 0.5 + 1.0) : mix(b, c, v);
  col *= 0.85 + uBeat * 0.4;
  gl_FragColor = vec4(col, 1.0);
}`,
    'Julia Fractal': `void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 z = uv * 2.0 - 1.0;
  z.x *= uRes.x / uRes.y;
  vec2 c = vec2(-0.746 + 0.12 * sin(uTime * 0.3) + uBass * 0.06,
                 0.113 + 0.12 * cos(uTime * 0.23) + uMid * 0.06);
  float n = 0.0;
  for (int i = 0; i < 48; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 16.0) break;
    n += 1.0;
  }
  float m = n / 48.0;
  vec3 col = mix(vec3(0.02, 0.03, 0.12), vec3(0.2, 0.75, 1.0), m);
  col = mix(col, vec3(1.0, 0.4, 0.85), pow(m, 3.0) + uBeat * 0.15);
  gl_FragColor = vec4(col * (0.8 + uLevel), 1.0);
}`,
    'Warp Grid': `void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * 2.0 - 1.0;
  float horizon = 0.15;
  vec3 col = vec3(0.02, 0.01, 0.06);
  if (uv.y < 1.0 - horizon) {
    float z = 1.0 / (1.0 - horizon - uv.y + 0.001);
    float x = p.x * z;
    float ln = abs(fract(x * 0.5 + uTime * 0.2) - 0.5);
    float hz = abs(fract(z * 0.35 - uTime * (0.6 + uBass)) - 0.5);
    float g = smoothstep(0.48, 0.5, max(1.0 - ln * 2.0, 0.0) + 0.0);
    col += vec3(0.9, 0.2, 0.7) * (1.0 - smoothstep(0.0, 0.06, ln)) * exp(-z * 0.08);
    col += vec3(0.2, 0.9, 1.0) * (1.0 - smoothstep(0.0, 0.05, hz)) * exp(-z * 0.08);
  }
  gl_FragColor = vec4(col, 1.0);
}`,
    'Audio Rings': `void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= uRes.x / uRes.y;
  float r = length(p);
  float a = atan(p.y, p.x);
  float spec = texture2D(uSpectrum, vec2(fract(r * 0.7 - uTime * 0.1), 0.5)).r;
  float rings = sin(r * 24.0 - uTime * 3.0 + spec * 6.0 + uBass * 4.0);
  float glow = smoothstep(0.2, 1.0, spec) * exp(-r * 0.9);
  vec3 col = mix(vec3(0.05, 0.6, 0.9), vec3(1.0, 0.3, 0.75), r + spec * 0.5);
  col *= smoothstep(0.9, 1.0, rings) * (0.4 + glow * 2.0 + uBeat * 0.3);
  col += vec3(0.9, 0.95, 1.0) * glow * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`,
    'Ink Flow': `float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.545); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * 3.0;
  float t = uTime * (0.2 + uLevel * 0.5);
  vec2 q = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    q += vec2(sin(p.y * 1.7 + t + float(i) * 1.3), cos(p.x * 1.7 - t + float(i))) * 0.5;
    p += q * 0.4;
  }
  float v = length(q);
  vec3 col = mix(vec3(0.01, 0.02, 0.05), vec3(0.55, 0.35, 1.0), smoothstep(0.4, 2.2, v));
  col = mix(col, vec3(0.1, 0.95, 0.85), smoothstep(1.8, 3.0, v) * (0.6 + uTreble));
  gl_FragColor = vec4(col, 1.0);
}`,
  };

  const VERT = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

  L.register({
    id: 'shader', name: 'Shader (GLSL)', cat: 'Visuals', icon: 'globe',
    desc: 'Write custom GLSL fragment shaders, audio-reactive',
    defaults: () => ({ code: SHADER_PRESETS['Neon Plasma'], quality: .75 }),
    params: [
      P.area('code', 'Fragment shader (GLSL)'),
      P.num('quality', 'Resolution scale', .1, 1, .05, .75),
      P.group('Presets', [
        P.act('p1', 'Neon Plasma', (l) => { l.props.code = SHADER_PRESETS['Neon Plasma']; l._dirty = true; }),
        P.act('p2', 'Julia Fractal', (l) => { l.props.code = SHADER_PRESETS['Julia Fractal']; l._dirty = true; }),
        P.act('p3', 'Warp Grid', (l) => { l.props.code = SHADER_PRESETS['Warp Grid']; l._dirty = true; }),
        P.act('p4', 'Audio Rings', (l) => { l.props.code = SHADER_PRESETS['Audio Rings']; l._dirty = true; }),
        P.act('p5', 'Ink Flow', (l) => { l.props.code = SHADER_PRESETS['Ink Flow']; l._dirty = true; }),
      ]),
    ],
    draw(x, st) {
      const { W, H, p, t, a, layer } = st;
      if (!ensureGL(layer)) { drawShaderFallback(x, st); return; }
      /* (re)compile when the code changed */
      if (layer._code !== p.code || layer._dirty || !layer._prog) {
        layer._code = p.code; layer._dirty = false;
        compileShader(layer, p.code);
      }
      if (!layer._prog) { drawShaderFallback(x, st); return; }
      const rw = Math.max(16, Math.round(W * clamp(p.quality, .05, 1)));
      const rh = Math.max(16, Math.round(H * clamp(p.quality, .05, 1)));
      if (layer._glc.width !== rw || layer._glc.height !== rh) { layer._glc.width = rw; layer._glc.height = rh; }
      const gl2 = layer._gl;
      gl2.viewport(0, 0, rw, rh);
      gl2.useProgram(layer._prog);
      gl2.uniform2f(layer._u.uRes, rw, rh);
      gl2.uniform1f(layer._u.uTime, t);
      gl2.uniform1f(layer._u.uBass, a.bass);
      gl2.uniform1f(layer._u.uMid, a.mid);
      gl2.uniform1f(layer._u.uTreble, a.treble);
      gl2.uniform1f(layer._u.uLevel, a.level);
      gl2.uniform1f(layer._u.uBeat, a.beat);
      /* spectrum texture */
      const eng = VX.audio.engine;
      if (!layer._spec) layer._spec = new Uint8Array(256 * 1 * 4);
      for (let i = 0; i < 256; i++) {
        const v = eng.freq && eng.freq.length ? eng.freq[Math.floor(i / 256 * eng.freq.length)] || 0 : 0;
        layer._spec[i * 4] = v; layer._spec[i * 4 + 1] = v; layer._spec[i * 4 + 2] = v; layer._spec[i * 4 + 3] = 255;
      }
      if (!layer._tex) {
        layer._tex = gl2.createTexture();
        gl2.bindTexture(gl2.TEXTURE_2D, layer._tex);
        gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
        gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
        gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
        gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
      }
      gl2.bindTexture(gl2.TEXTURE_2D, layer._tex);
      gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, 256, 1, 0, gl2.RGBA, gl2.UNSIGNED_BYTE, layer._spec);
      gl2.uniform1i(layer._u.uSpectrum, 0);
      gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4);
      x.drawImage(layer._glc, -W / 2, -H / 2, W, H);
    }
  });

  function ensureGL(layer) {
    if (layer._glFail) return null;
    if (layer._gl) return layer._gl;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl', { antialias: false, preserveDrawingBuffer: true, alpha: false })
        || c.getContext('experimental-webgl');
      if (!gl) { layer._glFail = true; return null; }
      layer._glc = c; layer._gl = gl;
      /* fullscreen quad */
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      layer._quad = buf;
      return gl;
    } catch (e) { layer._glFail = true; return null; }
  }

  function compileShader(layer, code) {
    const gl = layer._gl;
    try {
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, VERT);
      gl.compileShader(vs);
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, SHADER_HEADER + '\n' + code);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        layer._glErr = gl.getShaderInfoLog(fs);
        console.warn('shader compile:', layer._glErr);
        layer._prog = null;
        return;
      }
      layer._glErr = null;
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { layer._prog = null; return; }
      if (layer._prog) gl.deleteProgram(layer._prog);
      layer._prog = prog;
      layer._u = {
        uRes: gl.getUniformLocation(prog, 'uRes'),
        uTime: gl.getUniformLocation(prog, 'uTime'),
        uBass: gl.getUniformLocation(prog, 'uBass'),
        uMid: gl.getUniformLocation(prog, 'uMid'),
        uTreble: gl.getUniformLocation(prog, 'uTreble'),
        uLevel: gl.getUniformLocation(prog, 'uLevel'),
        uBeat: gl.getUniformLocation(prog, 'uBeat'),
        uSpectrum: gl.getUniformLocation(prog, 'uSpectrum'),
      };
      const loc = gl.getAttribLocation(prog, 'aPos');
      gl.bindBuffer(gl.ARRAY_BUFFER, layer._quad);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    } catch (e) {
      layer._prog = null;
      layer._glErr = String(e);
    }
  }

  function drawShaderFallback(x, st) {
    /* graceful fallback when WebGL is unavailable */
    const { W, H, t, a, layer } = st;
    const g = x.createLinearGradient(-W / 2, -H / 2, W / 2, H / 2);
    g.addColorStop(0, `hsl(${(t * 30 + a.bass * 60) % 360},70%,18%)`);
    g.addColorStop(1, `hsl(${(t * 30 + 120 + a.bass * 60) % 360},70%,28%)`);
    x.fillStyle = g;
    x.fillRect(-W / 2, -H / 2, W, H);
    if (layer._glErr || layer._glFail) {
      x.fillStyle = 'rgba(255,255,255,.5)';
      x.font = `${Math.round(H / 40)}px monospace`;
      x.textAlign = 'center';
      x.fillText('WebGL unavailable — shader preview disabled', 0, 0);
    }
  }

  /* ═════════ 3D PARTICLES ═════════ */
  L.register({
    id: 'particles3d', name: '3D Particles', cat: 'Visuals', icon: 'particles',
    desc: 'Depth-projected particle field flying past the camera',
    defaults: () => ({
      count: 220, size: 4, spread: 2.4, depth: 6, speed: 1.2, fov: 1.2,
      yawSpeed: .2, pitchSpeed: .05, pitch: .1,
      c1: '#7c5cff', c2: '#22d3ee', gradient: true, glow: 10,
      bassSize: .6, levelSpeed: 1.2, beatKick: .4, twinkle: .4
    }),
    params: [
      P.num('count', 'Count', 10, 2000, 5, 220),
      P.num('size', 'Size', .5, 20, .5, 4),
      P.num('spread', 'Spread', .5, 6, .1, 2.4),
      P.num('depth', 'Depth', 2, 20, .5, 6),
      P.num('speed', 'Fly speed', 0, 8, .1, 1.2, { auto: true }),
      P.num('fov', 'Field of view', .3, 3, .05, 1.2),
      P.num('yawSpeed', 'Yaw (°/s)', -180, 180, 1, .2),
      P.num('pitchSpeed', 'Pitch (°/s)', -90, 90, 1, .05),
      P.num('pitch', 'Base pitch (°)', -80, 80, 1, .1),
      P.color('c1', 'Near color'), P.color('c2', 'Far color'), P.bool('gradient', 'Depth colors'),
      P.num('glow', 'Glow', 0, 40, 1, 10),
      P.num('bassSize', 'Bass size boost', 0, 2, .05, .6),
      P.num('levelSpeed', 'Level speed boost', 0, 4, .05, 1.2),
      P.num('beatKick', 'Beat kick', 0, 2, .05, .4),
      P.num('twinkle', 'Twinkle', 0, 1, .01, .4),
    ],
    draw(x, st) {
      const { W, H, p, t, dt, a, layer } = st;
      const n = Math.round(p.count);
      if (!layer._p3 || layer._p3.length !== n) {
        layer._p3 = [];
        for (let i = 0; i < n; i++) layer._p3.push({
          x: (U.hash(i * 7.1 + layer._seed * 40) - .5) * 2, y: (U.hash(i * 3.7 + 2) - .5) * 2,
          z: U.hash(i * 9.3) * p.depth + .05, h: U.hash(i * 1.7), tw: U.hash(i * 5.9) * 7
        });
      }
      const v = p.speed * (1 + a.level * p.levelSpeed) * (1 + a.beat * p.beatKick);
      const yaw = t * p.yawSpeed * Math.PI / 180;
      const pitch = (p.pitch + Math.sin(t * p.pitchSpeed) * 30 * (p.pitchSpeed ? 1 : 0)) * Math.PI / 180;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const m = Math.min(W, H);
      x.save();
      if (p.glow) { x.shadowBlur = p.glow * (H / 1080); }
      for (const pt of layer._p3) {
        pt.z -= v * dt;
        if (pt.z < .08) {
          pt.z = p.depth;
          pt.x = (U.hash(Math.random() * 999) - .5) * 2;
          pt.y = (U.hash(Math.random() * 999 + 4) - .5) * 2;
        }
        /* rotate yaw around Y, pitch around X */
        const x1 = pt.x * cy - pt.z * sy, z1 = pt.x * sy + pt.z * cy;
        const y2 = pt.y * cp - z1 * sp, z2 = pt.y * sp + z1 * cp;
        if (z2 < .1) continue;
        const k = p.fov / z2;
        const px2 = x1 * p.spread * k * m * .5, py = y2 * p.spread * k * m * .5;
        if (Math.abs(px2) > W * .75 || Math.abs(py) > H * .75) continue;
        const depth = clamp(1 - z2 / p.depth, 0, 1);
        const tw = p.twinkle ? .6 + .4 * Math.sin(pt.tw + t * 3) : 1;
        const sz = p.size * (.25 + depth * 1.4) * (1 + a.bass * p.bassSize) * (H / 1080) * tw;
        const col = p.gradient ? U.lerpColor(p.c2, p.c1, depth) : p.c1;
        x.globalAlpha = (st.alpha ?? 1) * clamp(.15 + depth, 0, 1);
        x.fillStyle = col;
        if (p.glow) x.shadowColor = col;
        x.beginPath();
        x.arc(px2, py, Math.max(.4, sz), 0, 7);
        x.fill();
      }
      x.restore();
    }
  });

  /* ═════════ SPHERICAL FIELD ═════════ */
  L.register({
    id: 'spherefield', name: 'Spherical Field', cat: 'Visuals', icon: 'globe',
    desc: 'Points on a rotating sphere, pulsing with the music',
    defaults: () => ({
      count: 500, radius: .3, size: 2.4, spin: 12, tilt: .3, tiltSpeed: .06,
      c1: '#22d3ee', c2: '#f472b6', byDepth: true, glow: 12,
      pulse: .5, jitter: .3, rings: 0, ringColor: '#22d3ee44', beatPop: .4
    }),
    params: [
      P.num('count', 'Point count', 24, 4000, 8, 500),
      P.num('radius', 'Radius', .05, .8, .01, .3),
      P.num('size', 'Point size', .5, 12, .5, 2.4),
      P.num('spin', 'Spin (°/s)', -180, 180, 1, 12),
      P.num('tilt', 'Tilt (°)', -80, 80, 1, .3),
      P.num('tiltSpeed', 'Tilt drift', -2, 2, .01, .06),
      P.color('c1', 'Color A'), P.color('c2', 'Color B'), P.bool('byDepth', 'Depth shading'),
      P.num('glow', 'Glow', 0, 40, 1, 12),
      P.num('pulse', 'Bass pulse', 0, 2, .05, .5),
      P.num('jitter', 'Treble jitter', 0, 2, .05, .3),
      P.num('rings', 'Latitude rings', 0, 8, 1, 0),
      P.color('ringColor', 'Ring color'),
      P.num('beatPop', 'Beat pop', 0, 1, .05, .4),
    ],
    draw(x, st) {
      const { W, H, p, t, a, layer } = st;
      const n = Math.round(p.count);
      if (!layer._sf || layer._sf.length !== n) {
        layer._sf = [];
        const ga = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < n; i++) {
          const yy = 1 - (i / Math.max(1, n - 1)) * 2;
          const r = Math.sqrt(Math.max(0, 1 - yy * yy));
          const th = ga * i;
          layer._sf.push({ x: Math.cos(th) * r, y: yy, z: Math.sin(th) * r, h: U.hash(i * 1.3) });
        }
      }
      const R = p.radius * Math.min(W, H) * (1 + a.bass * p.pulse * .35 + a.beat * p.beatPop * .2);
      const yaw = t * p.spin * Math.PI / 180;
      const tilt = (p.tilt + Math.sin(t * p.tiltSpeed * 2) * 14) * Math.PI / 180;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), ctl = Math.cos(tilt), stl = Math.sin(tilt);
      x.save();
      if (p.glow) { x.shadowBlur = p.glow * (H / 1080); x.shadowColor = p.c1; }
      for (const pt of layer._sf) {
        const x1 = pt.x * cyw - pt.z * syw, z1 = pt.x * syw + pt.z * cyw;
        const y2 = pt.y * ctl - z1 * stl, z2 = pt.y * stl + z1 * ctl;
        const jr = p.jitter ? 1 + (U.hash((layer._seed * 1e4 + (pt.h * 1e4) | 0) + Math.floor(t * 12)) - .5) * a.treble * p.jitter * .35 : 1;
        const zz = z2 * .5 + .5;
        const col = p.byDepth ? U.lerpColor(p.c2, p.c1, zz) : U.lerpColor(p.c1, p.c2, pt.h);
        x.globalAlpha = (st.alpha ?? 1) * (.25 + zz * .75);
        x.fillStyle = col;
        const sz = p.size * (H / 1080) * (.5 + zz * .9);
        x.beginPath();
        x.arc(x1 * R * jr, y2 * R * jr, Math.max(.4, sz), 0, 7);
        x.fill();
      }
      if (p.rings > 0) {
        x.globalAlpha = (st.alpha ?? 1) * .8;
        x.strokeStyle = p.ringColor;
        x.lineWidth = 1.2 * (H / 1080);
        for (let i = 1; i <= Math.round(p.rings); i++) {
          const yy = (i / (Math.round(p.rings) + 1)) * 2 - 1;
          const r = Math.sqrt(Math.max(0, 1 - yy * yy)) * R;
          x.beginPath();
          x.ellipse(0, yy * R * ctl, r, Math.max(.5, r * Math.abs(stl)), 0, 0, 7);
          x.stroke();
        }
      }
      x.restore();
    }
  });
})();
