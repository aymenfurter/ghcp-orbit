#!/usr/bin/env node
// Patches the local Electron.app bundle so macOS shows "Orbit" in the menu bar and dock during development.
import { execFileSync } from 'child_process';
import { existsSync, renameSync, writeFileSync } from 'fs';
import { resolve } from 'path';

if (process.platform !== 'darwin') process.exit(0);

const distDir = resolve('node_modules/electron/dist');
const oldApp = resolve(distDir, 'Electron.app');
const newApp = resolve(distDir, 'Orbit.app');

// Rename .app bundle if needed
const appDir = existsSync(newApp) ? newApp : existsSync(oldApp) ? oldApp : null;
if (!appDir) {
  console.log('Electron.app not found, skipping name patch.');
  process.exit(0);
}

const plist = resolve(appDir, 'Contents/Info.plist');

const edits = [
  ['CFBundleDisplayName', 'Orbit'],
  ['CFBundleName', 'Orbit'],
  ['CFBundleExecutable', 'Orbit'],
];

for (const [key, value] of edits) {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
  } catch {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist]);
  }
}

// Rename the executable
const oldExe = resolve(appDir, 'Contents/MacOS/Electron');
const newExe = resolve(appDir, 'Contents/MacOS/Orbit');
if (existsSync(oldExe) && !existsSync(newExe)) {
  renameSync(oldExe, newExe);
}

// Rename the .app bundle itself
if (appDir === oldApp && !existsSync(newApp)) {
  renameSync(oldApp, newApp);
}

// Update path.txt so the electron module finds the renamed binary
const pathTxt = resolve('node_modules/electron/path.txt');
writeFileSync(pathTxt, 'Orbit.app/Contents/MacOS/Orbit');

console.log('Patched Electron → Orbit (app bundle, executable, plist)');
