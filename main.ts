// "The Seed That Launched" — a fresh ai-excited-01 entry (Node 22, standard library only).
//
// A tiny seed on cracked earth ignites into a leaf-rocket blasting skyward past
// the moon. The program draws the whole image itself, pixel by pixel, into a
// 1024x1024 RGBA buffer and writes it out as a PNG it encodes by hand
// (zlib + CRC32, no dependencies). Deterministic: a fixed-seed PRNG drives every
// star, spark and smoke puff, so two runs write identical bytes.
//
// Run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 4);

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — no Math.random, no Date, same bytes always.
// ---------------------------------------------------------------------------
let seed = 20261116;
function rnd(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rr(a: number, b: number): number { return a + (b - a) * rnd(); }

// ---------------------------------------------------------------------------
// Pixel helpers (source-over blending).
// ---------------------------------------------------------------------------
function blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
  const i = (y * W + x) * 4;
  const sa = a / 255;
  const da = buf[i + 3] / 255;
  const out = sa + da * (1 - sa);
  if (out <= 0) return;
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / out);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / out);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / out);
  buf[i + 3] = Math.round(out * 255);
}

function fillRect(x0: number, y0: number, w: number, h: number, r: number, g: number, b: number, a = 255): void {
  const x1 = Math.min(W, Math.ceil(x0 + w));
  const y1 = Math.min(H, Math.ceil(y0 + h));
  for (let y = Math.max(0, Math.floor(y0)); y < y1; y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < x1; x++) blend(x, y, r, g, b, a);
  }
}

function fillCircle(cx: number, cy: number, rad: number, r: number, g: number, b: number, a = 255): void {
  const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(W - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(H - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) blend(x, y, r, g, b, a);
    }
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a = 255): void {
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) blend(x, y, r, g, b, a);
    }
  }
}

type Pt = { x: number; y: number };

function fillPoly(pts: Pt[], r: number, g: number, b: number, a = 255): void {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
        xs.push(p1.x + ((y - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x));
      }
    }
    xs.sort((x, y2) => x - y2);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i])), xb = Math.min(W - 1, Math.floor(xs[i + 1]));
      for (let x = xa; x <= xb; x++) blend(x, y, r, g, b, a);
    }
  }
}

function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, r: number, g: number, b: number, a = 255): void {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1, w / 3)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, r, g, b, a);
  }
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function mix(c1: number[], c2: number[], t: number): number[] {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// ---------------------------------------------------------------------------
// Sky: dusk gradient, deep indigo up top burning down to a hot orange horizon.
// ---------------------------------------------------------------------------
const skyStops: [number, number[]][] = [
  [0.0, [22, 10, 46]],
  [0.42, [61, 26, 94]],
  [0.68, [122, 43, 94]],
  [0.86, [217, 95, 67]],
];
const HORIZON = 880;
for (let y = 0; y < HORIZON; y++) {
  const t = y / HORIZON;
  let c: number[] = skyStops[skyStops.length - 1][1];
  for (let i = 0; i < skyStops.length - 1; i++) {
    if (t >= skyStops[i][0] && t <= skyStops[i + 1][0]) {
      c = mix(skyStops[i][1], skyStops[i + 1][1], (t - skyStops[i][0]) / (skyStops[i + 1][0] - skyStops[i][0]));
      break;
    }
  }
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    buf[i] = Math.round(c[0]); buf[i + 1] = Math.round(c[1]); buf[i + 2] = Math.round(c[2]); buf[i + 3] = 255;
  }
}

// ---------------------------------------------------------------------------
// Stars.
// ---------------------------------------------------------------------------
for (let i = 0; i < 150; i++) {
  const x = rr(0, W), y = rr(0, 760), rad = rnd() < 0.25 ? 2 : 1;
  fillCircle(x, y, rad, 255, 250, 235, Math.round(rr(110, 255)));
}
for (let i = 0; i < 9; i++) { // a few bright sparkle stars
  const x = rr(40, 980), y = rr(40, 500), s = rr(5, 9);
  thickLine(x - s, y, x + s, y, 2, 255, 250, 235, 220);
  thickLine(x, y - s, x, y + s, 2, 255, 250, 235, 220);
  fillCircle(x, y, 2, 255, 250, 235, 255);
}

// ---------------------------------------------------------------------------
// Moon, upper right, with craters and a soft halo.
// ---------------------------------------------------------------------------
const MOON = { x: 800, y: 215, r: 92 };
for (let k = 5; k >= 1; k--) fillCircle(MOON.x, MOON.y, MOON.r + k * 12, 247, 236, 210, 7);
fillCircle(MOON.x, MOON.y, MOON.r, 247, 236, 210, 255);
fillCircle(770, 185, 18, 217, 200, 163, 255);
fillCircle(825, 240, 13, 217, 200, 163, 255);
fillCircle(795, 255, 9, 217, 200, 163, 255);
fillCircle(835, 185, 7, 217, 200, 163, 255);
fillCircle(762, 232, 6, 217, 200, 163, 255);

// ---------------------------------------------------------------------------
// The leaf-rocket: a big green leaf, tip up, blasting diagonally up-right
// past the moon. Local coords: tip (0,-200), base (0,70).
// ---------------------------------------------------------------------------
const ANG = 35 * Math.PI / 180; // leaf's up-axis tilts 35 deg off vertical: tip up-right
const DIR = { x: Math.sin(ANG), y: -Math.cos(ANG) }; // flight direction, up-right
const PERP = { x: Math.cos(ANG), y: Math.sin(ANG) }; // leaf's sideways axis
const RC = { x: 500, y: 560 }; // rocket centre
function toWorld(lx: number, ly: number): Pt {
  return {
    x: RC.x + lx * Math.cos(ANG) - ly * Math.sin(ANG),
    y: RC.y + lx * Math.sin(ANG) + ly * Math.cos(ANG),
  };
}

// Warm glow behind the rocket so it pops off the dusk sky.
for (let k = 6; k >= 1; k--) {
  fillEllipse(RC.x, RC.y, 150 + k * 26, 230 + k * 30, 255, 170, 60, 6);
}

// Leaf body outline: pointed at both ends, widest just below the middle.
const outline: Pt[] = [];
for (let i = 0; i <= 24; i++) { // right edge, tip -> base
  const ly = -200 + (270 * i) / 24;
  const hw = 78 * Math.pow(Math.sin(Math.PI * (ly + 200) / 270), 0.75);
  outline.push(toWorld(hw, ly));
}
for (let i = 24; i >= 0; i--) { // left edge, base -> tip
  const ly = -200 + (270 * i) / 24;
  const hw = 78 * Math.pow(Math.sin(Math.PI * (ly + 200) / 270), 0.75);
  outline.push(toWorld(-hw, ly));
}
fillPoly(outline, 47, 158, 68, 255);
// Sunlit side: a slimmer, lighter leaf laid over the left half.
const shine: Pt[] = [];
for (let i = 0; i <= 24; i++) {
  const ly = -200 + (270 * i) / 24;
  const hw = 78 * Math.pow(Math.sin(Math.PI * (ly + 200) / 270), 0.75);
  shine.push(toWorld(-hw * 0.55, ly));
}
for (let i = 24; i >= 0; i--) {
  const ly = -200 + (270 * i) / 24;
  shine.push(toWorld(0, ly));
}
fillPoly(shine, 126, 211, 92, 255);
// Central vein, tip to base, and side veins.
const tip = toWorld(0, -200), base = toWorld(0, 70);
thickLine(tip.x, tip.y, base.x, base.y, 7, 27, 94, 40, 255);
for (const ly of [-140, -80, -20, 30]) {
  const hw = 78 * Math.pow(Math.sin(Math.PI * (ly + 200) / 270), 0.75);
  const p = toWorld(0, ly);
  thickLine(p.x, p.y, toWorld(hw * 0.8, ly + 26).x, toWorld(hw * 0.8, ly + 26).y, 3, 27, 94, 40, 200);
  thickLine(p.x, p.y, toWorld(-hw * 0.8, ly + 26).x, toWorld(-hw * 0.8, ly + 26).y, 3, 27, 94, 40, 200);
}
// Two small fins near the base.
fillPoly([toWorld(-30, 40), toWorld(-95, 105), toWorld(-28, 78)], 27, 94, 40, 255);
fillPoly([toWorld(30, 40), toWorld(95, 105), toWorld(28, 78)], 27, 94, 40, 255);
// Nose glow: the tip is catching the sun.
fillCircle(tip.x, tip.y, 10, 255, 240, 170, 110);

// ---------------------------------------------------------------------------
// Flame: three layered tongues streaming back down toward the launch point,
// plus flicker blobs, smoke, and speed lines.
// ---------------------------------------------------------------------------
function flameTongue(len: number, halfW: number, r: number, g: number, b: number, a: number): void {
  const apex = { x: base.x - DIR.x * len + rr(-14, 14), y: base.y - DIR.y * len + rr(-14, 14) };
  const l = { x: base.x + PERP.x * halfW, y: base.y + PERP.y * halfW };
  const rr2 = { x: base.x - PERP.x * halfW, y: base.y - PERP.y * halfW };
  fillPoly([apex, l, rr2], r, g, b, a);
}
flameTongue(300, 58, 255, 110, 0, 255);
flameTongue(215, 38, 255, 210, 63, 255);
flameTongue(130, 20, 255, 247, 204, 255);
// Flicker blobs riding the flame.
for (let i = 0; i < 14; i++) {
  const d = rr(20, 290);
  const lat = rr(-34, 34);
  const cx = base.x - DIR.x * d + PERP.x * lat;
  const cy = base.y - DIR.y * d + PERP.y * lat;
  const hot = rnd() < 0.5;
  fillCircle(cx, cy, rr(4, 11), 255, hot ? 210 : 140, hot ? 90 : 30, Math.round(rr(150, 235)));
}
// Smoke puffs trailing back to the ground, pooling where the trail meets earth.
for (let i = 0; i < 6; i++) {
  const d = 300 + i * 30;
  const cx = base.x - DIR.x * d + PERP.x * rr(-22, 22) + rr(-8, 8);
  const cy = Math.min(868, base.y - DIR.y * d + PERP.y * rr(-22, 22));
  fillCircle(cx, cy, 16 + i * 5, 207, 196, 214, Math.round(rr(28, 55)));
}
// Ground-hugging smoke bank around the launch crater.
fillEllipse(250, 862, 80, 15, 207, 196, 214, 32);
fillEllipse(330, 870, 90, 16, 207, 196, 214, 28);
fillEllipse(170, 868, 60, 13, 207, 196, 214, 26);
// Speed lines streaking past the rocket.
for (let i = 0; i < 12; i++) {
  const d = rr(-260, 320);
  const lat = (rnd() < 0.5 ? -1 : 1) * rr(95, 230);
  const len = rr(45, 130);
  const cx = RC.x + DIR.x * d + PERP.x * lat;
  const cy = RC.y + DIR.y * d + PERP.y * lat;
  thickLine(cx, cy, cx + DIR.x * len, cy + DIR.y * len, 3, 255, 255, 255, Math.round(rr(70, 150)));
}
// A few seed-leaves shaken loose, tumbling in the wake.
for (let i = 0; i < 8; i++) {
  const d = rr(60, 300);
  const lat = (rnd() < 0.5 ? -1 : 1) * rr(70, 150);
  fillCircle(RC.x + DIR.x * d + PERP.x * lat, RC.y + DIR.y * d + PERP.y * lat, rr(3, 6), 126, 211, 92, 230);
}

// ---------------------------------------------------------------------------
// Cracked earth at the bottom, glowing launch crater, split seed husk.
// ---------------------------------------------------------------------------
for (let y = HORIZON; y < H; y++) {
  const t = (y - HORIZON) / (H - HORIZON);
  const c = mix([58, 36, 24], [20, 11, 8], t);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    buf[i] = Math.round(c[0]); buf[i + 1] = Math.round(c[1]); buf[i + 2] = Math.round(c[2]); buf[i + 3] = 255;
  }
}
thickLine(0, HORIZON, W, HORIZON, 3, 255, 140, 60, 90); // horizon ember line

const LAUNCH = { x: 276, y: HORIZON + 4 };
// Glowing crater where the seed stood.
fillEllipse(LAUNCH.x, LAUNCH.y, 96, 20, 255, 90, 0, 70);
fillEllipse(LAUNCH.x, LAUNCH.y, 64, 14, 255, 140, 26, 95);
fillEllipse(LAUNCH.x, LAUNCH.y, 34, 8, 255, 210, 63, 130);
// Cracks radiating out across the dry earth.
for (let i = 0; i < 6; i++) {
  let px = LAUNCH.x + rr(-40, 40), py = LAUNCH.y + rr(-2, 6);
  const ang = rr(-Math.PI, 0); // outward and downward
  const segs = 3 + Math.floor(rr(0, 3));
  for (let s = 0; s < segs; s++) {
    const nx = px + Math.cos(ang + rr(-0.5, 0.5)) * rr(28, 60);
    const ny = Math.min(H - 6, py + Math.abs(Math.sin(ang)) * rr(14, 34) + rr(4, 18));
    thickLine(px, py, nx, ny, 4, 15, 8, 5, 255);
    px = nx; py = ny;
  }
}
// Embers scattered around the crater.
for (let i = 0; i < 26; i++) {
  const x = LAUNCH.x + rr(-150, 150), y = LAUNCH.y + rr(-6, 60);
  fillCircle(x, y, rr(1.5, 3.5), 255, rr(120, 200), 30, Math.round(rr(140, 255)));
}
// The split seed husk, left behind at the launch point.
fillPoly([{ x: 258, y: 872 }, { x: 272, y: 868 }, { x: 268, y: 882 }], 122, 74, 33, 255);
fillPoly([{ x: 282, y: 872 }, { x: 296, y: 868 }, { x: 292, y: 882 }], 122, 74, 33, 255);
fillCircle(275, 874, 3, 190, 150, 90, 255); // the last seed-heart, still glowing

// ---------------------------------------------------------------------------
// Caption: "ONE SEED. ONE SKY." — chunky 5x7 bitmap letters, gold underline.
// ---------------------------------------------------------------------------
const FONT: Record<string, string[]> = {
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
function drawText(text: string, x0: number, y0: number, s: number, r: number, g: number, b: number, a = 255): void {
  let cx = x0;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === '#') fillRect(cx + col * s, y0 + row * s, s, s, r, g, b, a);
      }
    }
    cx += 6 * s;
  }
}
const CAPTION = 'ONE SEED. ONE SKY.';
const SCALE = 9;
const capW = CAPTION.length * 6 * SCALE - SCALE;
const capX = Math.round((W - capW) / 2);
const capY = 34;
drawText(CAPTION, capX + 4, capY + 4, SCALE, 20, 8, 40, 255); // shadow
drawText(CAPTION, capX, capY, SCALE, 255, 248, 231, 255);    // face
fillRect(capX, capY + 7 * SCALE + 10, capW, 4, 255, 210, 63, 220); // gold underline

// ---------------------------------------------------------------------------
// PNG encoding by hand: IHDR + IDAT (zlib) + IEND, filter 0 scanlines.
// ---------------------------------------------------------------------------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter: none
    Buffer.from(buf.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePNG());
