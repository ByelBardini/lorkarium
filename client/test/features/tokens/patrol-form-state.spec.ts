import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  canStepSpeed,
  patrolSummaryOf,
  speedText,
  steppedSpeed,
} from '@/features/tokens/patrol-form-state';

const KAEL_ROUTE = [cell(4, 4), cell(8, 4), cell(8, 8)];

describe('patrol form state', () => {
  it.each([
    [1, 1, 1.25],
    [1, -1, 0.75],
    [4, 1, 4],
    [0.25, -1, 0.25],
  ])('speed %s stepped %s is %s, kept within 0.25 and 4', (speed, direction, next) => {
    expect(steppedSpeed(speed, direction as 1 | -1)).toBe(next);
  });

  it('the − stops at 0.25 and the + at 4', () => {
    expect(canStepSpeed(0.25, -1)).toBe(false);
    expect(canStepSpeed(4, 1)).toBe(false);
    expect(canStepSpeed(1, 1)).toBe(true);
  });

  it('reads the speed in cells per second, with a comma', () => {
    expect(speedText(1)).toBe('1 casa/s');
    expect(speedText(1.25)).toBe('1,25 casas/s');
  });

  it('Kael’s circuit of 3 points walks 12 cells a lap, 12 s at 1 cell/s', () => {
    expect(patrolSummaryOf({ path: KAEL_ROUTE, repeat: 'loop', speed: 1 })).toBe(
      '3 pontos · 12 casas por volta · 12 s',
    );
  });

  it('the same route there and back walks 16 cells, 8 s at 2 cells/s', () => {
    expect(patrolSummaryOf({ path: KAEL_ROUTE, repeat: 'bounce', speed: 2 })).toBe(
      '3 pontos · 16 casas por volta · 8 s',
    );
  });

  it('a lap past a minute reads in minutes', () => {
    expect(patrolSummaryOf({ path: KAEL_ROUTE, repeat: 'loop', speed: 0.25 })).toBe(
      '3 pontos · 12 casas por volta · 48 s',
    );
    const long = [cell(0, 0), cell(19, 0)];
    expect(patrolSummaryOf({ path: long, repeat: 'bounce', speed: 0.5 })).toBe(
      '2 pontos · 38 casas por volta · 1 min 16 s',
    );
  });

  it('a route that does not leave the token’s cell only counts its points', () => {
    expect(patrolSummaryOf({ path: [cell(4, 4)], repeat: 'loop', speed: 1 })).toBe('1 ponto');
  });
});
