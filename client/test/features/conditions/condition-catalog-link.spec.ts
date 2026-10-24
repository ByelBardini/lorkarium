import { describe, expect, it } from 'vitest';
import { catalogFailureMessage, usageText } from '@/features/conditions/condition-catalog-link';

describe('usageText', () => {
  it.each([
    [0, 'Nenhum token tem essa condição.'],
    [1, 'Está em 1 token.'],
    [2, 'Está em 2 tokens. Ela sai de todos.'],
    [17, 'Está em 17 tokens. Ela sai de todos.'],
  ])('%i tokens read "%s"', (tokens, text) => {
    expect(usageText(tokens)).toBe(text);
  });
});

describe('catalogFailureMessage', () => {
  it('a missing condition (the shared token_not_found) reads as the condition, not the token', () => {
    expect(catalogFailureMessage('token_not_found')).toBe('Essa condição não está mais na lista.');
  });

  it('a taken name reads as the board says it', () => {
    expect(catalogFailureMessage('name_taken')).toBe('Já há uma condição com esse nome.');
  });
});
