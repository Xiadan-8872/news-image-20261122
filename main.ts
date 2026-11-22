// news-image-20261122 entry program.
//
// Renders a single 1024x1024 image summing up the world news of
// Sunday 22 November 2026 and writes it to /output/entry.png.
//
// Pure Node.js, standard library only, no network, fully deterministic:
// the same bytes are produced on every run. Text is drawn with a
// hand-written 5x7 pixel font (this file); the PNG is encoded by hand
// (CRC32 + zlib deflate from node:zlib).
//
// News (22 Nov 2026, verified from Xinhua, The Economic Times,
// Qatar Tribune and Dawn on 22 Nov 2026):
//  1. G20 Summit opens in Johannesburg — first G20 on African soil.
//  2. COP31 climate talks run into overtime; fossil-fuel dispute
//     threatens the deal.
//  3. Trump vows a 10% cap on credit-card interest rates, working
//     with Democrats.
//  4. NATO vows to defend "every inch" of Poland after a Russian
//     airspace violation.
//  5. The UN's top court finds Myanmar guilty of genocide against
//     the Rohingya.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- font --
// Hand-written 5x7 pixel font. Each glyph is 7 rows of 5 cells.
// "#" = ink, "." = blank. Only the characters the poster uses.
const FONT: Record<string, string[]> = {
  "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  "C": [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  "G": [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  "N": ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "#....", "####.", "....#", "....#", "####."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ",": [".....", ".....", ".....", ".....", ".....", ".##..", ".#..."],
  ":": [".....", ".##..", ".##..", ".....", ".....", ".##..", ".##.."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "%": ["#...#", "#..#.", "...#.", "..#..", ".#...", "#.###", "#...#"],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  "'": ["..#..", "..#..", "..#..", ".....", ".....", ".....", "....."],
};

// ------------------------------------------------------------- canvas --
// RGB framebuffer, 1024x1024.
const W = 1024;
const H = 1024;
const buf = Buffer.alloc(W * H * 3);

type RGB = [number, number, number];
const INK: RGB = [242, 240, 233]; // off-white
const PAPER: RGB = [16, 24, 32]; // deep navy
const RED: RGB = [192, 57, 43]; // header band
const GOLD: RGB = [232, 180, 74]; // number badges
const MUTED: RGB = [168, 178, 190]; // secondary text

function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) px(xx, yy, c);
}

// Draw text left-aligned at (x, y) with integer scale. Returns width used.
function text(x: number, y: number, s: string, scale: number, c: RGB): number {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch];
    if (!g) {
      cx += 6 * scale;
      continue;
    }
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "#") {
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++)
              px(cx + col * scale + dx, y + r * scale + dy, c);
        }
      }
    }
    cx += 6 * scale;
  }
  return cx - x;
}

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function textCentered(y: number, s: string, scale: number, c: RGB): void {
  const w = textWidth(s, scale);
  text(Math.floor((W - w) / 2), y, s, scale, c);
}

// ---------------------------------------------------------------- png --
// Minimal PNG writer: 8-bit RGB, no interlace, single IDAT.
function crc32(b: Buffer): number {
  let table = (crc32 as unknown as { t?: Int32Array }).t;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as unknown as { t: Int32Array }).t = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // Scanlines: filter byte 0 + RGB rows.
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    buf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------- layout --
const ITEMS: Array<{ n: string; head: string; sub: string }> = [
  {
    n: "1",
    head: "G20 OPENS IN JOHANNESBURG",
    sub: "FIRST G20 SUMMIT HELD ON AFRICAN SOIL",
  },
  {
    n: "2",
    head: "COP31 TALKS RUN INTO OVERTIME",
    sub: "FOSSIL-FUEL DISPUTE THREATENS A CLIMATE DEAL",
  },
  {
    n: "3",
    head: "TRUMP VOWS 10% CARD-RATE CAP",
    sub: "WILL WORK WITH DEMOCRATS TO CAP INTEREST",
  },
  {
    n: "4",
    head: "NATO: EVERY INCH OF POLAND",
    sub: "ALLIANCE VOWS DEFENCE AFTER AIRSPACE BREACH",
  },
  {
    n: "5",
    head: "MYANMAR GUILTY OF GENOCIDE",
    sub: "TOP UN COURT RULES ON THE ROHINGYA CASE",
  },
];

function draw(): void {
  // Background.
  rect(0, 0, W, H, PAPER);
  // Header band.
  rect(0, 0, W, 118, RED);
  textCentered(28, "THE WORLD IN ONE IMAGE", 4, INK);
  textCentered(86, "SUNDAY, 22 NOVEMBER 2026", 2, INK);
  // Thin gold rule under the header.
  rect(0, 118, W, 4, GOLD);

  // News items.
  let y = 168;
  const itemH = 148;
  for (const it of ITEMS) {
    // Number badge.
    rect(56, y + 6, 56, 56, GOLD);
    const nw = textWidth(it.n, 4);
    text(56 + Math.floor((56 - nw) / 2), y + 14, it.n, 4, PAPER);
    // Headline (scale 3) and summary (scale 2).
    text(140, y + 8, it.head, 3, INK);
    text(140, y + 62, it.sub, 2, MUTED);
    // Divider rule, except after the last item.
    if (it !== ITEMS[ITEMS.length - 1]) {
      rect(56, y + itemH - 22, W - 112, 2, [52, 66, 84]);
    }
    y += itemH;
  }

  // Footer.
  rect(0, 946, W, 2, GOLD);
  textCentered(968, "SOURCES: XINHUA - ECONOMIC TIMES - QATAR TRIBUNE - DAWN", 2, MUTED);
  textCentered(994, "RENDERED BY AN AI AGENT - DETERMINISTIC, NO NETWORK", 2, MUTED);
}

// ---------------------------------------------------------------- main --
draw();
const png = encodePNG();
mkdirSync("/output", { recursive: true });
writeFileSync("/output/entry.png", png);
console.log(`entry.png written: ${png.length} bytes, ${W}x${H}`);
