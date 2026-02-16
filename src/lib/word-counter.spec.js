import { describe, it, expect } from 'vitest';
import {
  countWords,
  countCharacters,
  countCharactersNoSpaces,
  countSentences,
  countParagraphs,
  computeStats,
  computeWordDensity
} from './word-counter.js';

describe('countWords', () => {
  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(countWords('   \t\n  ')).toBe(0);
  });

  it('counts a single word', () => {
    expect(countWords('hello')).toBe(1);
  });

  it('counts multiple words separated by spaces', () => {
    expect(countWords('hello world foo bar')).toBe(4);
  });

  it('handles multiple spaces between words', () => {
    expect(countWords('hello    world')).toBe(2);
  });

  it('handles tabs and newlines as separators', () => {
    expect(countWords('hello\tworld\nfoo')).toBe(3);
  });

  it('handles leading and trailing whitespace', () => {
    expect(countWords('  hello world  ')).toBe(2);
  });
});

describe('countCharacters', () => {
  it('returns 0 for empty string', () => {
    expect(countCharacters('')).toBe(0);
  });

  it('counts all characters including spaces', () => {
    expect(countCharacters('hello world')).toBe(11);
  });

  it('counts newlines as characters', () => {
    expect(countCharacters('a\nb')).toBe(3);
  });
});

describe('countCharactersNoSpaces', () => {
  it('returns 0 for empty string', () => {
    expect(countCharactersNoSpaces('')).toBe(0);
  });

  it('excludes spaces', () => {
    expect(countCharactersNoSpaces('hello world')).toBe(10);
  });

  it('excludes tabs and newlines', () => {
    expect(countCharactersNoSpaces('a\t b\n c')).toBe(3);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(countCharactersNoSpaces('   \t\n  ')).toBe(0);
  });
});

describe('countSentences', () => {
  it('returns 0 for empty string', () => {
    expect(countSentences('')).toBe(0);
  });

  it('returns 0 for text without sentence-ending punctuation', () => {
    expect(countSentences('hello world')).toBe(0);
  });

  it('counts sentences ending with a period', () => {
    expect(countSentences('Hello world. This is a test.')).toBe(2);
  });

  it('counts sentences ending with exclamation marks', () => {
    expect(countSentences('Wow! Amazing!')).toBe(2);
  });

  it('counts sentences ending with question marks', () => {
    expect(countSentences('Is this a test? Yes it is.')).toBe(2);
  });

  it('treats consecutive punctuation as one sentence end', () => {
    expect(countSentences('Really?! Yes...')).toBe(2);
  });

  it('handles mixed sentence terminators', () => {
    expect(countSentences('Hello. How are you? Great!')).toBe(3);
  });
});

describe('countParagraphs', () => {
  it('returns 0 for empty string', () => {
    expect(countParagraphs('')).toBe(0);
  });

  it('counts a single paragraph (no blank lines)', () => {
    expect(countParagraphs('This is one paragraph.')).toBe(1);
  });

  it('counts two paragraphs separated by a blank line', () => {
    expect(countParagraphs('First paragraph.\n\nSecond paragraph.')).toBe(2);
  });

  it('counts three paragraphs', () => {
    const text = 'First.\n\nSecond.\n\nThird.';
    expect(countParagraphs(text)).toBe(3);
  });

  it('ignores extra blank lines between paragraphs', () => {
    expect(countParagraphs('First.\n\n\n\nSecond.')).toBe(2);
  });

  it('handles single line breaks as same paragraph', () => {
    expect(countParagraphs('Line one.\nLine two.')).toBe(1);
  });

  it('ignores blank-line-only input', () => {
    expect(countParagraphs('\n\n\n')).toBe(0);
  });
});

describe('computeStats', () => {
  it('returns all zeros for empty string', () => {
    const stats = computeStats('');
    expect(stats).toEqual({
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      sentences: 0,
      paragraphs: 0
    });
  });

  it('computes correct stats for a real paragraph', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const stats = computeStats(text);
    expect(stats.words).toBe(9);
    expect(stats.characters).toBe(44);
    expect(stats.charactersNoSpaces).toBe(36);
    expect(stats.sentences).toBe(1);
    expect(stats.paragraphs).toBe(1);
  });

  it('computes correct stats for multi-paragraph text', () => {
    const text = 'Hello world. How are you?\n\nI am fine! Thanks for asking.\n\nGoodbye.';
    const stats = computeStats(text);
    expect(stats.words).toBe(12);
    expect(stats.sentences).toBe(5);
    expect(stats.paragraphs).toBe(3);
  });
});

describe('computeWordDensity', () => {
  it('returns empty array for empty string', () => {
    expect(computeWordDensity('')).toEqual([]);
  });

  it('returns single entry for a single word', () => {
    const result = computeWordDensity('hello');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ word: 'hello', count: 1, percentage: 100 });
  });

  it('sorts by count descending', () => {
    const result = computeWordDensity('the cat sat on the mat the');
    expect(result[0].word).toBe('the');
    expect(result[0].count).toBe(3);
  });

  it('lowercases words', () => {
    const result = computeWordDensity('Hello HELLO hello');
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe('hello');
    expect(result[0].count).toBe(3);
    expect(result[0].percentage).toBe(100);
  });

  it('strips punctuation from words', () => {
    const result = computeWordDensity('hello, world. hello!');
    const helloEntry = result.find((e) => e.word === 'hello');
    expect(helloEntry).toBeDefined();
    expect(helloEntry?.count).toBe(2);
  });

  it('calculates correct percentages', () => {
    const result = computeWordDensity('foo foo bar bar bar baz');
    // total = 6 words. bar=3 (50%), foo=2 (33.3%), baz=1 (16.7%)
    const barEntry = result.find((e) => e.word === 'bar');
    expect(barEntry?.percentage).toBe(50);

    const fooEntry = result.find((e) => e.word === 'foo');
    expect(fooEntry?.percentage).toBe(33.3);

    const bazEntry = result.find((e) => e.word === 'baz');
    expect(bazEntry?.percentage).toBe(16.7);
  });

  it('respects the limit parameter', () => {
    const text = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo';
    const result = computeWordDensity(text, 5);
    expect(result).toHaveLength(5);
  });

  it('excludes single-letter words from density results', () => {
    const result = computeWordDensity('I am a happy person and I am a great one');
    const singleLetterWords = result.filter((e) => e.word.length === 1);
    expect(singleLetterWords).toHaveLength(0);
    expect(result.find((e) => e.word === 'am')?.count).toBe(2);
    expect(result.find((e) => e.word === 'a')).toBeUndefined();
    expect(result.find((e) => e.word === 'i')).toBeUndefined();
  });

  it('handles text with only punctuation', () => {
    const result = computeWordDensity('... !!! ???');
    expect(result).toEqual([]);
  });
});
