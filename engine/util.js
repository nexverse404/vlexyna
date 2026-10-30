/* Vlexyna — util.js — helpers, icons, zip, toast */
'use strict';
const VX = window.VX || (window.VX = {});
/* ESM + classic dual-mode: bindings exported for bundlers, VX kept on window */
const U = VX.util = {};
VX.version = '3.1.0';   /* shown in the ribbon pill */

U.$ = (sel, root) => (root || document).querySelector(sel);
U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
U.el = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
};
U.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
U.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
U.lerp = (a, b, t) => a + (b - a) * t;
U.deep = (o) => JSON.parse(JSON.stringify(o));
U.debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
U.fmtTime = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), cs = Math.floor((s % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};
U.fmtBytes = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB';

/* ---------- colors ---------- */
U.hex2rgb = (h) => {
  h = (h || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
U.rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
U.withAlpha = (hex, a) => {
  const [r, g, b] = U.hex2rgb(hex);
  return `rgba(${r},${g},${b},${U.clamp(a, 0, 1)})`;
};
U.lerpColor = (h1, h2, t) => {
  const a = U.hex2rgb(h1), b = U.hex2rgb(h2);
  return U.rgb2hex(U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t));
};
U.shade = (hex, f) => f >= 0 ? U.lerpColor(hex, '#ffffff', f) : U.lerpColor(hex, '#000000', -f);
U.niceColor = () => `hsl(${Math.floor(Math.random() * 360)},${70 + Math.random() * 25}%,${55 + Math.random() * 15}%)`;

/* deterministic pseudo-random (for stable renders) */
U.hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------- download / files ---------- */
U.download = (blob, name) => {
  const a = U.el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
};
U.readDataURL = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
});
U.readText = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file);
});

/* ---------- PNG sequence ZIP writer (STORE, no compression) ---------- */
U.crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
U.crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = U.crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
U.ZipWriter = class {
  constructor() { this.files = []; }
  add(name, data) { this.files.push({ name: new TextEncoder().encode(name), data: data instanceof Uint8Array ? data : new Uint8Array(data) }); }
  async blob() {
    const enc = this.files.map(f => ({ ...f, crc: U.crc32(f.data) }));
    const parts = []; let offset = 0; const central = [];
    const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const f of enc) {
      const head = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(f.crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(f.name.length), ...u16(0)]);
      parts.push(head, f.name, f.data);
      central.push({ name: f.name, crc: f.crc, size: f.data.length, off: offset });
      offset += head.length + f.name.length + f.data.length;
    }
    const cdStart = offset;
    for (const f of central) {
      const c = new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(f.crc), ...u32(f.size), ...u32(f.size), ...u16(f.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(f.off)]);
      parts.push(c, f.name); offset += c.length + f.name.length;
    }
    const eocd = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(offset - cdStart), ...u32(cdStart), ...u16(0)]);
    parts.push(eocd);
    return new Blob(parts, { type: 'application/zip' });
  }
};

/* ---------- SVG icon set (stroke, 24x24) ---------- */
const ICON_PATHS = {
  logo: '<path d="M4 12h2l2-7 3 14 3-11 2 4h4" fill="none"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16M9.9 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.7C3.9 8.4 2 12 2 12s3.5 6.5 10 6.5c1.4 0 2.7-.3 3.8-.8"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.7-1.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  bars: '<path d="M4 20V10M9 20V4M14 20v-8M19 20V7"/>',
  wave: '<path d="M2 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-12 5-12 2.5 6 5 6"/>',
  particles: '<circle cx="6" cy="7" r="1.5" fill="currentColor" stroke="none"/><circle cx="17" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none"/><circle cx="18" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="10" cy="19" r="1" fill="currentColor" stroke="none"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M3 17l5-5 4 4 3-3 6 6"/>',
  video: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="M17 10l5-3v10l-5-3z"/>',
  text: '<path d="M5 5h14M12 5v15M9 20h6"/>',
  lyrics: '<path d="M4 6h16M4 11h12M4 16h9"/><circle cx="19" cy="16" r="2.5"/>',
  fx: '<path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19"/><circle cx="12" cy="12" r="3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  export: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  template: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9 1-.9 1.7"/><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.3" fill="currentColor" stroke="none"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/>',
  grid: '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18-3-4-3-14.5 0-18z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  shape: '<rect x="4" y="4" width="7" height="7" rx="1"/><circle cx="16.5" cy="16.5" r="4.5"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  volumeOff: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6"/>',
  loop: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  drag: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
  edit: '<path d="M4 20l4-1L19.5 7.5a2.1 2.1 0 0 0-3-3L5 16l-1 4z"/><path d="M13.5 6.5l3 3"/>',
  activity: '<path d="M3 12h4l2.5-7 4 14 2.5-7h5"/>',
  sliders: '<path d="M5 4v6M5 14v6M12 4v3M12 11v9M19 4v9M19 17v3"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="9" r="2"/><circle cx="19" cy="15" r="2"/>',
  media: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5v4M16 5v4M7.5 13.5l4 2.3v-4.6z" fill="currentColor" stroke="none"/>',
  cameraIcon: '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  wand: '<path d="M5 19L16 8M14.5 6.5L18 3M7 4l.6 1.6L9.2 6.2 7.6 6.8 7 8.4 6.4 6.8 4.8 6.2 6.4 5.6z"/><path d="M19 12l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z"/>',
  zap: '<path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5z"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  gauge: '<path d="M4 14a8 8 0 1 1 16 0"/><path d="M12 14l4-4"/><circle cx="12" cy="14" r="1.4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/>',
  clockIcon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  spark: '<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/>',
};
U.icon = (name, size) => `<svg class="ic" viewBox="0 0 24 24" width="${size || 16}" height="${size || 16}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;

/* ---------- toast ---------- */
let toastWrap;
U.toast = (msg, kind) => {
  if (!toastWrap) { toastWrap = U.el('div', { class: 'toasts' }); document.body.append(toastWrap); }
  const t = U.el('div', { class: 'toast ' + (kind || '') }, msg);
  toastWrap.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 3200);
};

/* color scheme generator for palettes */
U.palette = (base) => {
  const [r, g, b] = U.hex2rgb(base);
  const h0 = (() => { const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn; if (!d) return 0; const rr = (mx - r / 255) / 6 + d / 2, gg = (mx - g / 255) / 6 + d / 2, bb = (mx - b / 255) / 6 + d / 2; if (r / 255 === mx) return ((bb - gg) / d) % 1; if (g / 255 === mx) return (rr + 1 / 3) % 1; return (gg + 2 / 3) / d % 1; })();
  return [0, 40, 80, 160, 200, 300].map(off => `hsl(${((h0 * 360) + off) % 360}, 85%, 60%)`);
};
U.hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`;

export { U, VX };
