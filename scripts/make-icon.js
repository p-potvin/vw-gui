/* ==========================================================================
   vw-gui :: placeholder icon generator
   --------------------------------------------------------------------------
   Emits build/tray-16.png, build/tray-32.png and build/icon.png.

   The mark is the app's own structure: an obsidian field with a bone rail down
   the left and the coral seam between them. Deliberately simple — replace these
   with the real logo when it exists and delete this script.

     node scripts/make-icon.js
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "build");

const OBSIDIAN = [0x0a, 0x0c, 0x11];
const BONE = [0xed, 0xec, 0xe8];
const CORAL = [0xff, 0x8a, 0x6b];
const IRIS = [0x6e, 0x7b, 0xf2];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** pixels: (x, y, size) -> [r,g,b,a] */
function png(size, shade) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = shade(x, y, size);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The mark: rounded square, bone rail at 15%, coral seam, iris glow. */
function mark(x, y, size) {
  const r = Math.max(2, Math.round(size * 0.18)); // corner radius
  const inset = size <= 16 ? 0 : Math.round(size * 0.04);

  const min = inset;
  const max = size - 1 - inset;
  if (x < min || y < min || x > max || y > max) return [0, 0, 0, 0];

  // Rounded corners
  const cx = x < min + r ? min + r : x > max - r ? max - r : x;
  const cy = y < min + r ? min + r : y > max - r ? max - r : y;
  const dist = Math.hypot(x - cx, y - cy);
  if (dist > r) return [0, 0, 0, 0];
  const edge = dist > r - 1 ? 0.55 : 1; // cheap antialias on the corner

  const w = max - min + 1;
  const railEnd = min + Math.max(1, Math.round(w * 0.3));

  if (x < railEnd) return [...BONE, Math.round(255 * edge)];
  if (x === railEnd || x === railEnd + (size > 32 ? 1 : 0)) {
    return [...CORAL, Math.round(255 * edge)];
  }

  // Console field, with the seam glow bleeding to the right.
  const t = Math.min(1, (x - railEnd) / (w * 0.55));
  const glow = (1 - t) * 0.5;
  const col = [
    Math.round(OBSIDIAN[0] + (IRIS[0] - OBSIDIAN[0]) * glow),
    Math.round(OBSIDIAN[1] + (IRIS[1] - OBSIDIAN[1]) * glow),
    Math.round(OBSIDIAN[2] + (IRIS[2] - OBSIDIAN[2]) * glow),
  ];
  return [...col, Math.round(255 * edge)];
}

fs.mkdirSync(OUT, { recursive: true });
for (const [file, size] of [["tray-16.png", 16], ["tray-32.png", 32], ["icon.png", 256]]) {
  const buf = png(size, mark);
  fs.writeFileSync(path.join(OUT, file), buf);
  console.log("wrote", file, buf.length, "bytes");
}
