import { describe, expect, it } from 'vitest';
import { PLAN_LIMITS } from '@lorkarium/contracts';
import {
  SavedRollRulesBo,
  requireFolderRoom,
} from '../../../src/modules/saved-rolls/saved-roll.bo';

const OPEN = PLAN_LIMITS.amigo_do_dono;

const rules = new SavedRollRulesBo(50);

describe('SavedRollRulesBo.requireReadable', () => {
  it('"1d20+5" and "1d4" read as notation', () => {
    expect(() => rules.requireReadable(['1d20+5', '1d4'])).not.toThrow();
  });

  it('"2d" in the second piece is INVALID_DICE_EXPRESSION citing piece 2 and the reason of the game-core', () => {
    expect(() => rules.requireReadable(['1d20', '2d'])).toThrow(
      expect.objectContaining({
        code: 'INVALID_DICE_EXPRESSION',
        part: 2,
        message:
          'part 2 ("2d") cannot be read: Expected the number of sides at position 2; got the end of the expression.',
      }),
    );
  });

  it('10 pieces pass', () => {
    expect(() => rules.requireReadable(Array.from({ length: 10 }, () => '1d6'))).not.toThrow();
  });

  it('11 pieces are INVALID_DICE_EXPRESSION for the whole roll, citing the count', () => {
    expect(() => rules.requireReadable(Array.from({ length: 11 }, () => '1d6'))).toThrow(
      expect.objectContaining({
        code: 'INVALID_DICE_EXPRESSION',
        part: null,
        message: expect.stringContaining('11 parts: expected 1 to 10'),
      }),
    );
  });

  it('two pieces of 600 dice pass each alone and are refused together (1000 dice summed)', () => {
    expect(() => rules.requireReadable(['600d6', '600d6'])).toThrow(
      expect.objectContaining({ code: 'INVALID_DICE_EXPRESSION', part: null }),
    );
  });
});

describe('SavedRollRulesBo.requireRoomFor', () => {
  it('with 49 kept, the 50th fits', () => {
    expect(() => rules.requireRoomFor(49, OPEN)).not.toThrow();
  });

  it('with 50 kept, the next is SAVED_ROLLS_LIMIT "51 of 50"', () => {
    expect(() => rules.requireRoomFor(50, OPEN)).toThrow(
      expect.objectContaining({
        code: 'SAVED_ROLLS_LIMIT',
        message: expect.stringContaining('51 of 50'),
      }),
    );
  });
});

describe('SavedRollRulesBo.requireRoomFor under the table plan', () => {
  it('a free table with 2 kept: the 3rd fits', () => {
    expect(() => rules.requireRoomFor(2, PLAN_LIMITS.free)).not.toThrow();
  });

  it('a free table with 3 kept: the 4th is PLAN_LIMIT savedRolls, limit 3, plan free', () => {
    expect(() => rules.requireRoomFor(3, PLAN_LIMITS.free)).toThrow(
      expect.objectContaining({
        code: 'PLAN_LIMIT',
        resource: 'savedRolls',
        limit: 3,
        plan: 'free',
      }),
    );
  });

  it('a narrador table with 15 kept: the 16th is PLAN_LIMIT, limit 15', () => {
    expect(() => rules.requireRoomFor(15, PLAN_LIMITS.narrador)).toThrow(
      expect.objectContaining({ code: 'PLAN_LIMIT', limit: 15, plan: 'narrador' }),
    );
  });

  it('a lenda table with 50 kept: the technical SAVED_ROLLS_LIMIT answers, not the plan', () => {
    expect(() => rules.requireRoomFor(50, PLAN_LIMITS.lenda)).toThrow(
      expect.objectContaining({ code: 'SAVED_ROLLS_LIMIT', limit: 50 }),
    );
  });
});

describe('requireFolderRoom', () => {
  it('a free table: the first folder is PLAN_LIMIT savedRollFolders, limit 0', () => {
    expect(() => requireFolderRoom(0, 50, PLAN_LIMITS.free)).toThrow(
      expect.objectContaining({
        code: 'PLAN_LIMIT',
        resource: 'savedRollFolders',
        limit: 0,
        plan: 'free',
      }),
    );
  });

  it('a narrador table with 4 kept: the 5th fits', () => {
    expect(() => requireFolderRoom(4, 50, PLAN_LIMITS.narrador)).not.toThrow();
  });

  it('with 50 kept, the next is the technical SAVED_ROLL_FOLDERS_LIMIT "51 of 50"', () => {
    expect(() => requireFolderRoom(50, 50, OPEN)).toThrow(
      expect.objectContaining({
        code: 'SAVED_ROLL_FOLDERS_LIMIT',
        message: expect.stringContaining('51 of 50'),
      }),
    );
  });
});

describe('SavedRollRulesBo over the name and parts of a kept roll', () => {
  it('at a free table the 3rd roll born (rank 2) is configurable and not planLocked', () => {
    expect(() => rules.requireConfigurable(2, PLAN_LIMITS.free)).not.toThrow();
    expect(rules.isPlanLocked(2, PLAN_LIMITS.free)).toBe(false);
  });

  it('at a free table the 4th roll born (rank 3) is PLAN_LIMIT readOnly and planLocked', () => {
    expect(() => rules.requireConfigurable(3, PLAN_LIMITS.free)).toThrow(
      expect.objectContaining({
        code: 'PLAN_LIMIT',
        reason: 'readOnly',
        resource: 'savedRolls',
        stored: 4,
        limit: 3,
        plan: 'free',
      }),
    );
    expect(rules.isPlanLocked(3, PLAN_LIMITS.free)).toBe(true);
  });

  it('the narrador keeps 15 editable and the table without plan limit never locks', () => {
    expect([14, 15].map((rank) => rules.isPlanLocked(rank, PLAN_LIMITS.narrador))).toEqual([
      false,
      true,
    ]);
    expect(rules.isPlanLocked(49, OPEN)).toBe(false);
  });
});
