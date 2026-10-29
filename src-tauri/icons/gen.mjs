/* gen.mjs — generate the Vlexyna app icons (PNG / ICO / ICNS) from the bars mark.
   Run: npm run icons   (needs devDependencies installed)
   Draws the same mark as public/vlexyna.svg: five rounded bars on a dark tile. */
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(here, { recursive: true });

/* roundRect with a manual fallback for older canvas builds */
function rr(x, X, Y, W, H, R) {
  if (typeof x.roundRect === 'function') { x.roundRect(X, Y, W, H, R); return; }
  R = Math.min(R, W / 2, H / 2);
  x.moveTo(X + R, Y);
  x.arcTo(X + W, Y, X + W, Y + H, R);
  x.arcTo(X + W, Y + H, X, Y + H, R);
  x.arcTo(X, Y + H, X, Y, R);
  x.arcTo(X, Y, X + W, Y, R);
  x.closePath();
}

/* the mark, drawn at any size */
function draw(size, { pad = 0.16, rounded = true } = {}) {
  const c = createCanvas(size, size);
  const x = c.getContext('2d');
  // tile
  const r = size * 0.225;
  x.beginPath();
  if (rounded) { rr(x, 0, 0, size, size, r); } else { x.rect(0, 0, size, size); }
  x.closePath();
  const bg = x.createLinearGradient(0, size, size, 0);
  bg.addColorStop(0, '#0b0d13');
  bg.addColorStop(1, '#141827');
  x.fillStyle = bg;
  x.fill();
  // bars
  const heights = [0.45, 0.85, 0.62, 1.0, 0.32];
  const n = heights.length;
  const area = size * (1 - pad * 2);
  const bw = area / (n * 1.9 - 0.9);
  const gap = bw * 0.9;
  const totalW = n * bw + (n - 1) * gap;
  let bx = (size - totalW) / 2;
  for (let i = 0; i < n; i++) {
    const h = area * heights[i];
    const y = (size - h) / 2 + area * 0.06;
    const g = x.createLinearGradient(bx, y + h, bx + bw, y);
    g.addColorStop(0, '#22d3ee');
    g.addColorStop(1, '#7c5cff');
    x.fillStyle = g;
    x.beginPath();
    rr(x, bx, y, bw, h, Math.min(bw / 2, size * 0.035));
    x.fill();
    bx += bw + gap;
  }
  return c;
}

/* ── PNGs ── */
const png = (canvas) => canvas.toBuffer('image/png');
const sizes = { '32x32.png': 32, '128x128.png': 128, '128x128@2x.png': 256, 'icon.png': 1024 };
for (const [name, s] of Object.entries(sizes)) writeFileSync(join(here, name), png(draw(s)));

/* ── ICO (PNG-embedded — valid for Windows Vista+) ── */
{
  const entries = [[32, 32], [128, 128], [256, 256]];
  const datas = entries.map(([s]) => png(draw(s)));
  const count = entries.length;
  const header = 6;
  const dir = 16 * count;
  let offset = header + dir;
  const parts = [Buffer.from([0, 0, 0, 1, (count >> 8) & 255, count & 255])];
  const dirs = [];
  entries.forEach(([s], i) => {
    const dim = s >= 256 ? 0 : s;
    dirs.push(Buffer.from([dim, dim, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    const sz = datas[i].length;
    dirs[i].writeUInt32LE(sz, 8);
    dirs[i].writeUInt32LE(offset, 12);
    offset += sz;
  });
  writeFileSync(join(here, 'icon.ico'), Buffer.concat([parts[0], ...dirs, ...datas]));
}

/* ── ICNS (PNG-embedded chunks — valid for macOS 10.7+) ── */
{
  const types = [['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]];
  const chunks = [];
  for (const [type, s] of types) {
    const data = png(draw(s));
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    chunks.push(Buffer.concat([head, data]));
  }
  const total = chunks.reduce((a, c) => a + c.length, 0) + 8;
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(total, 4);
  writeFileSync(join(here, 'icon.icns'), Buffer.concat([head, ...chunks]));
}

console.log('icons written to', here, '— 32/128/256/1024 png, icon.ico, icon.icns');
