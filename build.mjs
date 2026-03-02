import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const dist = 'dist';

await esbuild.build({
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'es2022',
  format: 'cjs',
  outfile: path.join(dist, 'main', 'index.js'),
  sourcemap: true,
  external: ['electron', '@github/copilot-sdk', '@github/copilot', 'vscode-jsonrpc', 'zod'],
});

await esbuild.build({
  entryPoints: ['src/main/parse-worker.ts'],
  bundle: true,
  platform: 'node',
  target: 'es2022',
  format: 'cjs',
  outfile: path.join(dist, 'main', 'parse-worker.js'),
  sourcemap: true,
  external: ['electron'],
});

await esbuild.build({
  entryPoints: ['src/preload/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'es2022',
  format: 'cjs',
  outfile: path.join(dist, 'preload', 'index.js'),
  sourcemap: true,
  external: ['electron'],
});

await esbuild.build({
  entryPoints: ['src/renderer/app.ts'],
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  outfile: path.join(dist, 'renderer', 'index.js'),
  sourcemap: true,
});

fs.cpSync('src/renderer/index.html', path.join(dist, 'renderer', 'index.html'));
fs.cpSync('src/renderer/styles.css', path.join(dist, 'renderer', 'styles.css'));
fs.cpSync('assets/icon.png', path.join(dist, 'renderer', 'icon.png'));

console.log('Build complete.');
