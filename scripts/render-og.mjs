// Renders the social card (src/web/public/og.svg) to a PNG that link scrapers
// can actually display. Discord, Twitter, Facebook and friends only embed raster
// og:image formats, so we ship a PNG alongside the SVG (the SVG stays the source
// of truth and is used for the README banner).
//
// Run after editing og.svg:  npm run render:og
// Needs system fonts for the title/tagline text, so run it on a dev machine
// (not inside the minimal Docker build image), then commit the PNG.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'src/web/public/og.svg');
const pngPath = path.join(root, 'src/web/public/og.png');

const svg = readFileSync(svgPath, 'utf8');
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
});
const png = resvg.render().asPng();
writeFileSync(pngPath, png);
console.log(`wrote ${path.relative(root, pngPath)} (${png.length} bytes, 1200x630)`);
