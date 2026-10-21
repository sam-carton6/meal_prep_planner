// Draws the app icons (a plate on green) as PNGs, so no image editor is needed.
// Run: npm run icons   → public/icons/icon-192.png, icon-512.png, apple-touch-icon.png
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const GREEN = [47, 111, 79];
const WHITE = [255, 255, 255];
const RIM = [221, 232, 226];
const FOOD = [233, 160, 64];

function pixel(x, y, size) {
  const c = size / 2;
  const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / size;
  if (d < 0.17) return FOOD;
  if (d < 0.27) return WHITE;
  if (d < 0.33) return RIM;
  return GREEN;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let i = 0;
  for (let y = 0; y < size; y++) {
    raw[i++] = 0; // no filter
    for (let x = 0; x < size; x++) for (const v of pixel(x, y, size)) raw[i++] = v;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) {
  writeFileSync(`public/icons/${name}.png`, png(size));
}
console.log('Wrote public/icons/');
