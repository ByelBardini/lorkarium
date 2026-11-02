import { describe, expect, it } from 'vitest';
import { seatMoveOf } from '../../../src/modules/characters/character-seat.bo';

describe('seatMoveOf', () => {
  it.each([
    ['spectator → player without a character', 'create', 'spectator', 'player', false],
    ['master → player without a character', 'create', 'master', 'player', false],
    [
      'spectator → master without a character (masters get none)',
      'keep',
      'spectator',
      'master',
      false,
    ],
    ['player → spectator without a character', 'keep', 'player', 'spectator', false],
    ['player → spectator with the stored one', 'hide', 'player', 'spectator', true],
    ['master → spectator with the stored one', 'hide', 'master', 'spectator', true],
    ['spectator → player with the stored one (not another)', 'reveal', 'spectator', 'player', true],
    ['spectator → master with the stored one', 'reveal', 'spectator', 'master', true],
    ['player → master with the stored one', 'keep', 'player', 'master', true],
    ['master → player with the stored one', 'keep', 'master', 'player', true],
    ['out of the table with the stored one', 'leave', 'player', null, true],
    ['out of the table without a character', 'keep', null, null, false],
  ] as const)('%s is %s', (_case, move, from, to, stored) => {
    expect(seatMoveOf({ from, to, stored })).toBe(move);
  });
});
