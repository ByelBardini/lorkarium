import { describe, expect, it } from 'vitest';
import { initialsOf } from '@/lib/token-initials';

describe('initialsOf', () => {
  it.each([
    ['Ogro das Cinzas', 'OC'],
    ['Kael', 'KA'],
    ['lyra rubra', 'LR'],
    ['Goblin 2', 'G2'],
    ['  Águia  ', 'ÁG'],
    ['X', 'X'],
    ['Senhor de Vharn e do Sino', 'SV'],
    ['', ''],
  ])('"%s" → "%s"', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});
