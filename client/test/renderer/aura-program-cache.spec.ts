import type { AuraEffectDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { AuraProgramCache } from '@/renderer/aura-program-cache';

class ProgramCompilerFake {
  readonly compiled: AuraEffectDto[] = [];
  readonly compile = (effect: AuraEffectDto): { effect: AuraEffectDto } => {
    this.compiled.push(effect);
    return { effect };
  };
}

describe('aura program cache', () => {
  it('two fire auras share one compiled program', () => {
    const compiler = new ProgramCompilerFake();
    const cache = new AuraProgramCache(compiler.compile);
    expect(cache.programOf('fire')).toBe(cache.programOf('fire'));
    expect(compiler.compiled).toEqual(['fire']);
  });

  it('each effect compiles its own program once', () => {
    const compiler = new ProgramCompilerFake();
    const cache = new AuraProgramCache(compiler.compile);
    cache.programOf('fire');
    cache.programOf('water');
    cache.programOf('fire');
    expect(compiler.compiled).toEqual(['fire', 'water']);
    expect(cache.programOf('water').effect).toBe('water');
  });
});
