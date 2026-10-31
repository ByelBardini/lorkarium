import { describe, expect, it } from 'vitest';
import {
  consoleErrorCountLabel,
  consolePositionLabel,
} from '@/features/sheets/sheet-console-labels';

describe('consoleErrorCountLabel', () => {
  it.each([
    [0, 'Sem erros'],
    [1, '1 erro'],
    [3, '3 erros'],
  ])('%i → %s', (errors, label) => expect(consoleErrorCountLabel(errors)).toBe(label));
});

describe('consolePositionLabel', () => {
  it('says the line and the column of the JS file', () => {
    expect(consolePositionLabel({ line: 3, column: 9 })).toBe('linha 3, coluna 9');
  });
});
