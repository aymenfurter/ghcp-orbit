import { execSync } from 'child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Generates PNG icons from the SVG source for all platforms.
// Requires `sips` (macOS built-in) and `iconutil` (macOS built-in).
// For the .icns file (macOS app icon), we use iconutil.
// For Windows .ico, we bundle a multi-res PNG set that electron-builder handles.

const assetsDir = join(import.meta.dirname || __dirname, '..', 'assets');
const svgPath = join(assetsDir, 'icon.svg');
const iconsetDir = join(assetsDir, 'icon.iconset');

// Sizes needed for macOS iconset
const macSizes = [16, 32, 64, 128, 256, 512, 1024];
// Sizes needed for various purposes
const pngSizes = [16, 32, 48, 64, 128, 256, 512, 1024];

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function svgToPng(svgFile, pngFile, size) {
  // Use sips to convert — available on all macOS
  // First, we need a temporary PNG at high res, then resize
  // Actually, sips doesn't handle SVG. Let's use the built-in qlmanage or a simple approach.
  // We'll use a node-based approach with resvg if available, otherwise fall back to rsvg-convert or qlmanage.
  
  try {
    // Try rsvg-convert first (from librsvg, installable via brew)
    execSync(`rsvg-convert -w ${size} -h ${size} "${svgFile}" -o "${pngFile}"`, { stdio: 'pipe' });
    return true;
  } catch {
    // Fall back to qlmanage (macOS built-in, produces thumbnails)
    try {
      const tmpDir = join(assetsDir, '.tmp');
      ensureDir(tmpDir);
      execSync(`qlmanage -t -s ${size} -o "${tmpDir}" "${svgFile}"`, { stdio: 'pipe' });
      const generatedFile = join(tmpDir, 'icon.svg.png');
      if (existsSync(generatedFile)) {
        execSync(`sips -z ${size} ${size} "${generatedFile}" --out "${pngFile}"`, { stdio: 'pipe' });
        execSync(`rm -rf "${tmpDir}"`, { stdio: 'pipe' });
        return true;
      }
    } catch {}
  }
  return false;
}

async function main() {
  ensureDir(assetsDir);
  ensureDir(iconsetDir);

  console.log('Generating PNG icons from SVG...');

  // Generate all PNG sizes
  for (const size of pngSizes) {
    const outFile = join(assetsDir, `icon-${size}.png`);
    if (svgToPng(svgPath, outFile, size)) {
      console.log(`  icon-${size}.png`);
    } else {
      console.warn(`  SKIP icon-${size}.png (no SVG converter found)`);
    }
  }

  // Copy the 512px as the main icon.png
  const mainIcon = join(assetsDir, 'icon-512.png');
  if (existsSync(mainIcon)) {
    execSync(`cp "${mainIcon}" "${join(assetsDir, 'icon.png')}"`);
    console.log('  icon.png (512x512)');
  }

  // Generate macOS iconset
  console.log('\nGenerating macOS iconset...');
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
      execSync(`cp "${src}" "${dst}"`);
    }
  }

  // Generate .icns using iconutil
  try {
    const icnsPath = join(assetsDir, 'icon.icns');
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'pipe' });
    console.log('  icon.icns');
  } catch (e) {
    console.warn('  SKIP icon.icns (iconutil failed)');
  }

  console.log('\nDone! Icons are in assets/');
}

main().catch(console.error);
