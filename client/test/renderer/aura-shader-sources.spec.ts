import { AURA_EFFECTS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { AURA_FRAGMENTS, AURA_UNIFORMS, AURA_VERTEX } from '@/renderer/aura-shaders/aura-fragments';

const PHASE_13 = ['fire', 'water', 'lightning'] as const;
const PHASE_14 = ['frost', 'radiant', 'shadow', 'poison', 'arcane'] as const;

function declares(source: string, name: string): boolean {
  return new RegExp(`uniform\\s+\\w+\\s+${name}\\s*;`).test(source);
}

describe('aura shader sources', () => {
  // A misspelled uniform name blanks the aura with no console error.
  it.each([...PHASE_13])('the %s fragment declares every aura uniform', (effect) => {
    const missing = AURA_UNIFORMS.filter((name) => !declares(AURA_FRAGMENTS[effect], name));
    expect(missing).toEqual([]);
  });

  it.each([...PHASE_13])('the %s fragment writes finalColor in main', (effect) => {
    expect(AURA_FRAGMENTS[effect]).toMatch(/void\s+main\s*\(\s*(void)?\s*\)/);
    expect(AURA_FRAGMENTS[effect]).toMatch(/finalColor\s*=/);
  });

  it('fire, water and lightning each have their own fragment', () => {
    const sources = new Set(PHASE_13.map((effect) => AURA_FRAGMENTS[effect]));
    expect(sources.size).toBe(PHASE_13.length);
  });

  it('the vertex hands the local position to the fragment', () => {
    expect(AURA_VERTEX).toMatch(/out\s+vec2\s+vPosition\s*;/);
    expect(AURA_FRAGMENTS.fire).toMatch(/in\s+vec2\s+vPosition\s*;/);
  });

  it.each([...PHASE_14])('the %s fragment declares every aura uniform', (effect) => {
    const missing = AURA_UNIFORMS.filter((name) => !declares(AURA_FRAGMENTS[effect], name));
    expect(missing).toEqual([]);
  });

  it('no effect falls back to a shared halo: all eight fragments differ', () => {
    const sources = new Set(AURA_EFFECTS.map((effect) => AURA_FRAGMENTS[effect]));
    expect(sources.size).toBe(AURA_EFFECTS.length);
  });
});
