#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });

console.log('Building...');
run('node', ['build.mjs']);

console.log('Starting Electron in dev mode...');
run('npx', ['electron', '.', '--dev']);
