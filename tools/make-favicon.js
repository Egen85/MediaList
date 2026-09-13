/**
 * make-favicon.js — generates the Media List! favicon:
 * matte near-black rounded square, subtle diagonal gradient,
 * rainbow left-pointing chevron. Zero dependencies, Node 18+.
 *
 * Usage: node tools/make-favicon.js   (writes public/favicon-{16,32,180,512}.png)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------------------------------------------------------------------
// tiny PNG encoder (RGBA, 8-bit)
// ---------------------------------------------------------------------------
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// the drawing
// ---------------------------------------------------------------------------
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function lerp(a, b, t) { return a + (b - a) * t; }

// distance from point p to segment ab (with round caps)
function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
  const dx = px - (ax + abx * t), dy = py - (ay + aby * t);
  return Math.hypot(dx, dy);
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const N = size;
  // geometry (normalized): left-pointing chevron  ‹
  const vx = 0.30, vy = 0.50;          // vertex (left point)
  const tx = 0.68, ty = 0.20;          // top arm end
  const bx = 0.68, by = 0.80;          // bottom arm end
  const stroke = 0.14;                 // chevron thickness, normalized
  const corner = 0.18 * N;             // rounded background corner

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4;
      // rounded-rect mask
      const cx = Math.min(x, N - 1 - x), cy = Math.min(y, N - 1 - y);
      if (cx < corner && cy < corner) {
        const dx = corner - cx, dy = corner - cy;
        const d = Math.hypot(dx, dy) - corner;
        if (d > 0.75) continue; // outside the rounded corner
        const mask = Math.max(0, Math.min(1, 0.75 - d + 0.25));
        // outside corner = transparent (page bg shows through)
        px[o + 3] = Math.round(255 * mask * 0); // keep transparent
        continue;
      }

      // subtle diagonal gradient, matte near-black
      const t = (x + y) / (2 * (N - 1));
      let r = lerp(0x14, 0x26, t);
      let g = lerp(0x14, 0x26, t);
      let b = lerp(0x18, 0x2b, t);

      // chevron: two segments; rainbow runs from top end -> vertex -> bottom end
      const pxN = x / (N - 1), pyN = y / (N - 1);
      const dTop = distToSegment(pxN, pyN, vx, vy, tx, ty);   // top arm
      const dBot = distToSegment(pxN, pyN, vx, vy, bx, by);   // bottom arm
      const d = Math.min(dTop, dBot);
      const half = stroke / 2;
      if (d < half + 1.2 / N) {
        // normalize the coverage: 1 at stroke center, fading over ~1.2px at the edge
        const alpha = Math.max(0, Math.min(1, (half - d) * (N / 1.2) + 0.5));
        // position along the whole path (0 = top end, 1 = bottom end)
        let s;
        if (dTop <= dBot) {
          const lenT = Math.hypot(tx - vx, ty - vy);
          s = -((pxN - vx) * (tx - vx) + (pyN - vy) * (ty - vy)) / (lenT * lenT); // 0 at vertex → 1 at top
          s = 0.5 * (1 - s); // top half
        } else {
          const lenB = Math.hypot(bx - vx, by - vy);
          s = ((pxN - vx) * (bx - vx) + (pyN - vy) * (by - vy)) / (lenB * lenB);
          s = 0.5 + 0.5 * s; // bottom half
        }
        const hue = lerp(0, 275, s); // red → orange → green → blue → violet
        const [cr, cg, cb] = hslToRgb(hue, 0.85, 0.55);
        r = lerp(r, cr, alpha);
        g = lerp(g, cg, alpha);
        b = lerp(b, cb, alpha);
      }

      px[o] = Math.round(r);
      px[o + 1] = Math.round(g);
      px[o + 2] = Math.round(b);
      px[o + 3] = 255;
    }
  }
  return encodePNG(N, px);
}

const outDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 180, 512]) {
  const file = path.join(outDir, `favicon-${size}.png`);
  fs.writeFileSync(file, render(size));
  console.log(`wrote ${path.relative(process.cwd(), file)} (${fs.statSync(file).size} bytes)`);
}
