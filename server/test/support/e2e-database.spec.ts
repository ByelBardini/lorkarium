import { describe, expect, it } from 'vitest';
import { e2eDatabaseName } from './e2e-database';

describe('e2eDatabaseName', () => {
  it('reads lorkarium_e2e out of a URL ending in _e2e', () => {
    expect(e2eDatabaseName('postgres://u:p@localhost:5432/lorkarium_e2e')).toBe('lorkarium_e2e');
  });

  it.each([
    ['the dev database', 'postgres://u:p@localhost:5432/lorkarium'],
    ['a name with a quote', 'postgres://u:p@localhost:5432/x%22_e2e'],
  ])('refuses %s, citing the name and the _e2e rule', (_, url) => {
    expect(() => e2eDatabaseName(url)).toThrow(
      /must be lowercase letters, digits and _, ending in _e2e/,
    );
  });
});
