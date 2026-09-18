/**
 * Generates every PWA/favicon asset from the brand tokens.
 *
 * Run after changing the brand colours or mark:
 *   node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT_DIR = path.join(process.cwd(), 'public', 'icons');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

const BG = '#0A2A1F';
const FG = '#FFFFFF';
const ACCENT = '#A3DCBF';

/** The mark itself, drawn centred in a 512 box. */
function markPaths() {
  return `<path d="M180 120h152a12 12 0 0 1 12 12v258l-29.3-20-29.3 20-29.3-20-29.3 20-29.3-20-29.3 20V132a12 12 0 0 1 12-12Z"
        fill="none" stroke="${FG}" stroke-width="26" stroke-linejoin="round"/>
  <path d="M204 180h104" stroke="${ACCENT}" stroke-width="24" stroke-linecap="round"/>
  <path d="M204 232h68" stroke="${ACCENT}" stroke-width="24" stroke-linecap="round"/>
  <path d="m204 300 34 34 70-76" fill="none" stroke="${ACCENT}" stroke-width="30"
        stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** @param {{ padded?: boolean, radius?: number, background?: string }} options */
function markSvg({ padded = false, radius = 108, background = BG } = {}) {
  // Maskable icons keep the mark inside the inner 80% safe zone.
  const scale = padded ? 0.74 : 1;
  const offset = (512 - 512 * scale) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${padded ? 0 : radius}" fill="${background}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    ${markPaths()}
  </g>
</svg>`;
}

async function png(svg, size, file, background) {
  let pipeline = sharp(Buffer.from(svg)).resize(size, size);
  if (background) pipeline = pipeline.flatten({ background });
  const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  await writeFile(file, buffer);
  return buffer;
}

/** Minimal ICO container wrapping a PNG payload. */
function icoFromPng(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const standard = markSvg();
  const maskable = markSvg({ padded: true, radius: 0 });

  await png(standard, 192, path.join(OUT_DIR, 'icon-192.png'));
  await png(standard, 512, path.join(OUT_DIR, 'icon-512.png'));
  await png(maskable, 192, path.join(OUT_DIR, 'maskable-192.png'));
  await png(maskable, 512, path.join(OUT_DIR, 'maskable-512.png'));

  // iOS home-screen icon: square, opaque, no transparency.
  await png(markSvg({ radius: 0 }), 180, path.join(OUT_DIR, 'apple-touch-icon.png'), BG);

  await png(standard, 32, path.join(OUT_DIR, 'favicon-32.png'));
  await png(standard, 16, path.join(OUT_DIR, 'favicon-16.png'));

  const favicon32 = await sharp(Buffer.from(standard)).resize(32, 32).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(PUBLIC_DIR, 'favicon.ico'), icoFromPng(favicon32, 32));

  await writeFile(path.join(OUT_DIR, 'icon.svg'), standard, 'utf8');

  // Social preview card.
  const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#F7F9F7"/>
    <rect x="0" y="0" width="1200" height="12" fill="${BG}"/>
    <g transform="translate(96 200)">
      <g transform="scale(0.44)"><rect width="512" height="512" rx="108" fill="${BG}"/>${markPaths()}</g>
      <text x="290" y="120" font-family="system-ui, sans-serif" font-size="88" font-weight="800" fill="#0A2A1F">Slipsy</text>
      <text x="292" y="184" font-family="system-ui, sans-serif" font-size="38" font-weight="500" fill="#4A5C52">Scan it. Save it. Done.</text>
    </g>
  </svg>`;
  await writeFile(
    path.join(PUBLIC_DIR, 'og-image.png'),
    await sharp(Buffer.from(ogSvg)).png({ compressionLevel: 9 }).toBuffer(),
  );

  console.log('Icons written to public/icons');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
