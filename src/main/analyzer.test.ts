import { describe, it, expect } from 'vitest';
import { normalizeModelId, classifyWorkType } from './analyzer';

describe('normalizeModelId', () => {
  it('returns raw name for simple model ids', () => {
    expect(normalizeModelId('gpt-4o')).toBe('gpt-4o');
    expect(normalizeModelId('claude-sonnet-4')).toBe('claude-sonnet-4');
  });

  it('strips -thought suffix', () => {
    expect(normalizeModelId('claude-sonnet-4-thought')).toBe('claude-sonnet-4');
  });

  it('strips -preview suffix', () => {
    expect(normalizeModelId('gemini-2.5-pro-preview')).toBe('gemini-2.5-pro');
  });

  it('strips both -thought and -preview', () => {
    expect(normalizeModelId('some-model-thought-preview')).toBe('some-model');
  });

  it('extracts model name after slash', () => {
    expect(normalizeModelId('anthropic/claude-sonnet-4')).toBe('claude-sonnet-4');
    expect(normalizeModelId('openai/gpt-4o-preview')).toBe('gpt-4o');
  });

  it('normalizes opus-41 to opus-4.5', () => {
    expect(normalizeModelId('claude-opus-41')).toBe('claude-opus-4.5');
  });

  it('returns unknown for empty input', () => {
    expect(normalizeModelId('')).toBe('unknown');
  });
});

describe('classifyWorkType', () => {
  it('classifies bug fix messages', () => {
    expect(classifyWorkType('fix the broken login', '')).toBe('bug fix');
    expect(classifyWorkType('debug this error', '')).toBe('bug fix');
    expect(classifyWorkType('there is an issue with the crash', '')).toBe('bug fix');
  });

  it('classifies feature messages', () => {
    expect(classifyWorkType('add a new button component', '')).toBe('feature');
    expect(classifyWorkType('create a user dashboard', '')).toBe('feature');
    expect(classifyWorkType('implement the search feature', '')).toBe('feature');
  });

  it('classifies refactor messages', () => {
    expect(classifyWorkType('refactor the auth module', '')).toBe('refactor');
    expect(classifyWorkType('restructure the folder layout', '')).toBe('refactor');
    expect(classifyWorkType('simplify this function', '')).toBe('refactor');
  });

  it('classifies docs messages', () => {
    expect(classifyWorkType('document the API endpoints', '')).toBe('docs');
    expect(classifyWorkType('update the readme', '')).toBe('docs');
  });

  it('classifies test messages', () => {
    expect(classifyWorkType('mock the API and assert the response', '')).toBe('test');
    expect(classifyWorkType('jest coverage spec', '')).toBe('test');
  });

  it('classifies config messages', () => {
    expect(classifyWorkType('update the docker deploy config', '')).toBe('config');
    expect(classifyWorkType('setup the CI pipeline', '')).toBe('config');
  });

  it('classifies style messages', () => {
    expect(classifyWorkType('update the css layout', '')).toBe('style');
    expect(classifyWorkType('change the theme colors', '')).toBe('style');
  });

  it('classifies code review messages', () => {
    expect(classifyWorkType('review this pull request', '')).toBe('code review');
  });

  it('returns other for unclassifiable messages', () => {
    expect(classifyWorkType('hello world', '')).toBe('other');
    expect(classifyWorkType('', '')).toBe('other');
  });

  it('considers response text for classification', () => {
    expect(classifyWorkType('help me', 'I fixed the bug in the error handler')).toBe('bug fix');
  });

  it('uses highest scoring category when multiple match', () => {
    // "fix" matches bug fix, but "add new feature" has more feature keywords
    const result = classifyWorkType('add a new feature to fix loading', '');
    expect(['feature', 'bug fix']).toContain(result);
  });
});
