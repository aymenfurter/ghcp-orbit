import { execSync } from 'child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Generates platform icons from pre-existing PNG source files in assets/.
// - macOS .icns via iconutil (macOS only)
// - Windows .ico via PNG-embedded ICO format (cross-platform)
// No SVG tools or external converters required.

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');
const iconsetDir = join(assetsDir, 'icon.iconset');

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function generateIco() {
  const sizes = [16, 32, 48, 256];
  const pngBuffers = sizes.map(s => readFileSync(join(assetsDir, `icon-${s}.png`)));

  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * sizes.length;
  let dataOffset = headerSize + dirSize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  const dirEntries = Buffer.alloc(dirSize);
  for (let i = 0; i < sizes.length; i++) {
    const off = i * dirEntrySize;
    const s = sizes[i];
    dirEntries.writeUInt8(s >= 256 ? 0 : s, off);
    dirEntries.writeUInt8(s >= 256 ? 0 : s, off + 1);
    dirEntries.writeUInt8(0, off + 2);
    dirEntries.writeUInt8(0, off + 3);
    dirEntries.writeUInt16LE(1, off + 4);
    dirEntries.writeUInt16LE(32, off + 6);
    dirEntries.writeUInt32LE(pngBuffers[i].length, off + 8);
    dirEntries.writeUInt32LE(dataOffset, off + 12);
    dataOffset += pngBuffers[i].length;
  }

  const ico = Buffer.concat([header, dirEntries, ...pngBuffers]);
  writeFileSync(join(assetsDir, 'icon.ico'), ico);
  console.log(`  icon.ico (${ico.length} bytes)`);
}

function generateIcns() {
  const iconsetPairs = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ];

  for (const [size, name] of iconsetPairs) {
    const src = join(assetsDir, `icon-${size}.png`);
    const dst = join(iconsetDir, name);
    if (existsSync(src)) {
      copyFileSync(src, dst);
    }
  }

  try {
    const icnsPath = join(assetsDir, 'icon.icns');
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'pipe' });
    console.log('  icon.icns');
  } catch {
    console.warn('  SKIP icon.icns (iconutil not available — macOS only)');
  }
}

async function main() {
  ensureDir(iconsetDir);

  console.log('Generating platform icons from PNGs...');

  generateIco();
  generateIcns();

  console.log('\nDone! Icons are in assets/');
}

main().catch(console.error);
