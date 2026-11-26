import { describe, expect, it } from 'vitest';
import {
  RoundCycleHolderNotFoundError,
  RoundCycleNotActiveError,
  RoundCyclePhaseNotFoundError,
} from '../../../src/modules/round-cycles/round-cycles.error';

describe('round cycle errors', () => {
  it('a loose token holder cites the table, the token and that it must be loose', () => {
    const error = new RoundCycleHolderNotFoundError('table-1', 'token', 'token-9');
    expect([error.code, error.message]).toEqual([
      'ROUND_CYCLE_HOLDER_NOT_FOUND',
      'campaign table-1 has no loose token token-9 to hold a round cycle',
    ]);
  });

  it('a cycle out of combat cites the cycle and the grid', () => {
    const error = new RoundCycleNotActiveError('cycle-1', 'scene-2');
    expect(error.message).toBe(
      'round cycle cycle-1 is not in a combat of scene scene-2; expected a combat it plays in',
    );
  });

  it('a phase of another cycle cites both and what was expected', () => {
    const error = new RoundCyclePhaseNotFoundError('cycle-1', 'phase-9');
    expect(error.message).toBe(
      'round cycle cycle-1 has no phase phase-9; expected one of its phases or null',
    );
  });
});
