import { describe, expect, it } from 'vitest';
import { dictionary } from '../src/engine';

describe('dictionary', () => {
  it('accepts an injected word list, case-insensitively', () => {
    const d = dictionary.createDictionary(['Bear', 'bearable']);
    expect(d.size).toBe(2);
    expect(d.has('bear')).toBe(true);
    expect(d.has('BEAR')).toBe(true);
    expect(d.has('bears')).toBe(false);
  });

  it('ignores words shorter than 2 letters, blanks and comments', () => {
    const d = dictionary.createDictionaryFromTexts('a\n\n# comment\nab\r\nabc\n', 'xyz');
    expect(d.size).toBe(3);
    expect(d.has('a')).toBe(false);
    expect(d.has('ab')).toBe(true);
    expect(d.has('xyz')).toBe(true);
  });

  it('merges base and custom lists', () => {
    const d = dictionary.createDictionaryFromTexts('form\nformal', 'morphemey');
    expect(d.has('morphemey')).toBe(true);
    expect(d.size).toBe(3);
  });
});
