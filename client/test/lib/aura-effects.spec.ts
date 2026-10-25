import { describe, expect, it } from 'vitest';
import { AURA_EFFECT_NAMES, auraEffectLabel } from '@/lib/aura-effects';

describe('AURA_EFFECT_NAMES', () => {
  it('names the eight effects in Portuguese, in the order of the picker', () => {
    expect(AURA_EFFECT_NAMES.map(({ effect, label }) => [effect, label])).toEqual([
      ['fire', 'Fogo'],
      ['water', 'Água'],
      ['lightning', 'Elétrico'],
      ['frost', 'Gelo'],
      ['radiant', 'Sagrado'],
      ['shadow', 'Sombrio'],
      ['poison', 'Veneno'],
      ['arcane', 'Arcano'],
    ]);
  });
});

describe('auraEffectLabel', () => {
  it('lightning is "Elétrico"', () => {
    expect(auraEffectLabel('lightning')).toBe('Elétrico');
  });
});
