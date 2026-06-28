// Renders the favicon (src/web/public/favicon.svg) to raster formats. Modern
// browsers use the SVG, but icon scrapers — Bitwarden, password managers, link
// previewers — generally can't render SVG and expect PNG/ICO, so we ship those
// too. The SVG stays the source of truth.
//
// Run after editing favicon.svg:  npm run render:favicons  (then commit the output)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'src/web/public');
const svg = readFileSync(path.join(pub, 'favicon.svg'), 'utf8');

const renderPng = (size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

const png = (name, size) => {
  const buf = renderPng(size);
  writeFileSync(path.join(pub, name), buf);
  console.log(`wrote ${name} (${buf.length} bytes, ${size}x${size})`);
  return buf;
};

const p32 = png('favicon-32.png', 32);
png('favicon-192.png', 192);
png('apple-touch-icon.png', 180);

// Single-image .ico wrapping the 32px PNG (the format allows a PNG payload),
// for scrapers that fetch /favicon.ico directly.
const ico = Buffer.alloc(22 + p32.length);
ico.writeUInt16LE(0, 0); // reserved
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(1, 4); // image count
ico.writeUInt8(32, 6); // width
ico.writeUInt8(32, 7); // height
ico.writeUInt8(0, 8); // palette
ico.writeUInt8(0, 9); // reserved
ico.writeUInt16LE(1, 10); // color planes
ico.writeUInt16LE(32, 12); // bits per pixel
ico.writeUInt32LE(p32.length, 14); // size of image data
ico.writeUInt32LE(22, 18); // offset to image data
p32.copy(ico, 22);
writeFileSync(path.join(pub, 'favicon.ico'), ico);
console.log(`wrote favicon.ico (${ico.length} bytes)`);
