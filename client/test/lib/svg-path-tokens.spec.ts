import { describe, expect, it } from 'vitest';
import { spacedPathData } from '@/lib/svg-path-tokens';

describe('spacedPathData', () => {
  it('splits arc flags that touch the next number', () => {
    expect(spacedPathData('M7.5 20.4a1.6 1.6 0 012.2 0')).toBe('M 7.5 20.4 a 1.6 1.6 0 0 1 2.2 0');
  });

  it('splits numbers glued by their sign or their dot', () => {
    expect(spacedPathData('m12.5 17-.5-1-.5 1h1z')).toBe('m 12.5 17 -.5 -1 -.5 1 h 1 z');
    expect(spacedPathData('M.5.5')).toBe('M .5 .5');
  });

  it('reads repeated arcs in one command, seven numbers each', () => {
    expect(spacedPathData('a1 1 0 0 0 2 2 1 1 0 11-2-2')).toBe('a 1 1 0 0 0 2 2 1 1 0 1 1 -2 -2');
  });

  it('leaves the flag-like digits of other commands as numbers', () => {
    expect(spacedPathData('M011 2')).toBe('M 011 2');
  });

  it('refuses what is not path data, naming where', () => {
    expect(() => spacedPathData('M1 #')).toThrow('at 3, got "#"');
  });
});
