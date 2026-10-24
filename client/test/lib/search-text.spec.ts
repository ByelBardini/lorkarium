import { describe, expect, it } from 'vitest';
import { searchText } from '@/lib/search-text';

describe('searchText', () => {
  it('drops the accents and the case, so "Ossuário" reads "ossuario"', () => {
    expect(searchText('Ossuário')).toBe('ossuario');
  });

  it('keeps the spaces and the other characters', () => {
    expect(searchText('Ato 2 › Pântano')).toBe('ato 2 › pantano');
  });
});
