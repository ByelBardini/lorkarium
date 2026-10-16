import { describe, expect, it } from 'vitest';
import { rulerLabel } from '@/lib/ruler-label';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };

describe('rulerLabel', () => {
  it('3 cells of 1.5 m read "3 casas · 4,5 m"', () => {
    expect(rulerLabel(3, METERS)).toBe('3 casas · 4,5 m');
  });

  it('1 cell is singular', () => {
    expect(rulerLabel(1, METERS)).toBe('1 casa · 1,5 m');
  });

  it('0 cells is plural and 0 m', () => {
    expect(rulerLabel(0, METERS)).toBe('0 casas · 0 m');
  });

  it('a whole distance has no decimals, in the unit of the scene', () => {
    expect(rulerLabel(4, { cellDistance: 5, cellUnit: 'ft' })).toBe('4 casas · 20 ft');
  });

  it('thousands use the pt-BR separator', () => {
    expect(rulerLabel(1000, METERS)).toBe('1.000 casas · 1.500 m');
  });
});
