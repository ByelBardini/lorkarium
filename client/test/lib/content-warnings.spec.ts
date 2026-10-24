import { describe, expect, it } from 'vitest';
import {
  CONTENT_WARNING_LABEL,
  sortedContentWarnings,
  TAG_SUGGESTIONS,
  toggleContentWarning,
} from '@/lib/content-warnings';

describe('content warnings', () => {
  it.each([
    ['adult', '+18'],
    ['violence', 'Violência'],
    ['horror', 'Terror'],
    ['gore', 'Gore'],
    ['strong-language', 'Linguagem forte'],
    ['sensitive-themes', 'Temas sensíveis'],
  ] as const)('%s reads "%s"', (warning, label) => {
    expect(CONTENT_WARNING_LABEL[warning]).toBe(label);
  });

  it('sorted puts the warnings in the form order, whatever order they came in', () => {
    expect(sortedContentWarnings(['gore', 'violence', 'adult'])).toEqual([
      'adult',
      'violence',
      'gore',
    ]);
  });

  it('toggling a warning that is off turns it on in the form order', () => {
    expect(toggleContentWarning(['gore'], 'adult')).toEqual(['adult', 'gore']);
  });

  it('toggling a warning that is on turns it off', () => {
    expect(toggleContentWarning(['adult', 'gore'], 'adult')).toEqual(['gore']);
  });

  it('the tag suggestions start with Investigação and Masmorra and have no repeats', () => {
    expect(TAG_SUGGESTIONS.slice(0, 2)).toEqual(['Investigação', 'Masmorra']);
    expect(new Set(TAG_SUGGESTIONS).size).toBe(TAG_SUGGESTIONS.length);
  });
});
