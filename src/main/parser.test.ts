import { describe, it, expect } from 'vitest';
import { techFromPath, shortPath } from './parser';

describe('techFromPath', () => {
  it('maps common extensions to technologies', () => {
    expect(techFromPath('src/app.ts')).toBe('TypeScript');
    expect(techFromPath('index.js')).toBe('JavaScript');
    expect(techFromPath('main.py')).toBe('Python');
    expect(techFromPath('server.go')).toBe('Go');
    expect(techFromPath('lib.rs')).toBe('Rust');
    expect(techFromPath('style.css')).toBe('CSS');
    expect(techFromPath('config.json')).toBe('JSON');
    expect(techFromPath('schema.sql')).toBe('SQL');
    expect(techFromPath('deploy.tf')).toBe('Terraform');
    expect(techFromPath('app.java')).toBe('Java');
    expect(techFromPath('page.html')).toBe('HTML');
    expect(techFromPath('script.sh')).toBe('Shell');
    expect(techFromPath('readme.md')).toBe('Markdown');
  });

  it('handles special filenames', () => {
    expect(techFromPath('Dockerfile')).toBe('Docker');
    expect(techFromPath('path/to/Dockerfile.prod')).toBe('Docker');
    expect(techFromPath('Makefile')).toBe('Make');
    expect(techFromPath('CMakeLists.txt')).toBe('CMake');
    expect(techFromPath('GNUmakefile')).toBe('Make');
  });

  it('normalizes backslashes in paths', () => {
    expect(techFromPath('src\\components\\App.tsx')).toBe('TypeScript');
  });

  it('returns empty string for unknown extensions', () => {
    expect(techFromPath('file.xyz')).toBe('');
    expect(techFromPath('noext')).toBe('');
  });

  it('handles SCSS/SASS/LESS as CSS', () => {
    expect(techFromPath('theme.scss')).toBe('CSS');
    expect(techFromPath('theme.sass')).toBe('CSS');
    expect(techFromPath('theme.less')).toBe('CSS');
  });

  it('handles YAML variants', () => {
    expect(techFromPath('config.yaml')).toBe('YAML');
    expect(techFromPath('config.yml')).toBe('YAML');
  });

  it('handles case-insensitive filenames', () => {
    expect(techFromPath('DOCKERFILE')).toBe('Docker');
    expect(techFromPath('MAKEFILE')).toBe('Make');
  });
});

describe('shortPath', () => {
  it('shortens a path relative to workspace name', () => {
    expect(shortPath('/home/user/my-project/src/index.ts', 'my-project'))
      .toBe('src/index.ts');
  });

  it('handles deeply nested files', () => {
    expect(shortPath('/home/user/my-project/src/components/Button.tsx', 'my-project'))
      .toBe('src/components/Button.tsx');
  });

  it('returns last 3 segments when workspace name not found', () => {
    expect(shortPath('/a/b/c/d/e/f.ts', 'nonexistent'))
      .toBe('d/e/f.ts');
  });

  it('normalizes backslashes', () => {
    expect(shortPath('C:\\Users\\dev\\my-project\\src\\main.ts', 'my-project'))
      .toBe('src/main.ts');
  });

  it('returns full path if fewer than 4 segments and no workspace match', () => {
    expect(shortPath('a/b/c', 'nonexistent'))
      .toBe('a/b/c');
  });
});
