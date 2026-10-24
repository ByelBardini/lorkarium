import { describe, expect, it } from 'vitest';
import {
  TokenRulesBo,
  requireBox,
  requireFacing,
} from '../../../src/modules/tokens/token-rules.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';
import {
  placedWallOf,
  type PlacedWall,
  type SceneWalls,
} from '../../../src/modules/walls/walls.mapper';
import type { WallPo } from '../../../src/modules/walls/walls.po';
import { northWallPo } from '../../support/walls-factories';

const SCENE = { widthCells: 20, heightCells: 12 };
const LIMIT = 99_999;
const MEMBERS = [ANA_ID, BIA_ID];

function rules(): TokenRulesBo {
  return new TokenRulesBo({ scene: SCENE, memberIds: MEMBERS, barLimit: LIMIT, tokenLimit: 500 });
}

describe('TokenRulesBo.admit', () => {
  it('the 500th token of a scene is admitted', () => {
    expect(rules().admit(499, 1)).toBe(500);
  });

  it('the 501st token is refused with TOKEN_LIMIT citing 501 and the limit of 500', () => {
    expect(() => rules().admit(500, 1)).toThrow(
      expect.objectContaining({
        code: 'TOKEN_LIMIT',
        message: 'the scene would have 501 tokens (500 stored + 1 added); the limit is 500',
      }),
    );
  });

  it('a paste of 64 on a scene of 450 is refused whole', () => {
    expect(() => rules().admit(450, 64)).toThrow(
      expect.objectContaining({ code: 'TOKEN_LIMIT', stored: 450, adding: 64, limit: 500 }),
    );
  });
});

describe('TokenRulesBo', () => {
  it('a 2×2 token placed at (18, 10) stays inside the scene', () => {
    expect(rules().place({ col: 18, row: 10 }, { width: 2, height: 2 })).toEqual({
      col: 18,
      row: 10,
    });
  });

  it('a 1.5×0.5 token at (18.5, 11.5) ends on the edge and fits', () => {
    expect(rules().place({ col: 18.5, row: 11.5 }, { width: 1.5, height: 0.5 })).toEqual({
      col: 18.5,
      row: 11.5,
    });
  });

  it('a token placed past the edge is refused with OUT_OF_SCENE citing the cell, size and scene', () => {
    expect(() => rules().place({ col: 19, row: 0 }, { width: 1.5, height: 1 })).toThrow(
      expect.objectContaining({
        code: 'OUT_OF_SCENE',
        message: expect.stringMatching(/\(19, 0\).*size 1\.5×1.*20×12/),
      }),
    );
  });

  it('a side off the half-cell steps is refused before placing', () => {
    expect(() => rules().place({ col: 0, row: 0 }, { width: 0.25, height: 1 })).toThrow(
      /width 0\.25/,
    );
  });

  it('controllers among the members pass, in order and without repeats', () => {
    expect(rules().controllers([BIA_ID, ANA_ID, BIA_ID])).toEqual([BIA_ID, ANA_ID]);
  });

  it('a controller who is not a member is refused citing the id', () => {
    expect(() => rules().controllers([BIA_ID, CAIO_ID])).toThrow(
      expect.objectContaining({
        code: 'INVALID_CONTROLLER',
        message: expect.stringContaining(CAIO_ID),
      }),
    );
  });

  it('adjusting a bar applies the change to the current and may go negative', () => {
    const bar = { current: 3, max: 10 };
    expect(rules().adjustBar(bar, { op: 'add', amount: -10 })).toEqual({ current: -7, max: 10 });
    expect(rules().adjustBar(bar, { op: 'set', value: 12 })).toEqual({ current: 12, max: 10 });
  });

  it('a new maximum keeps the current', () => {
    const bar = { current: 32, max: 45 };
    expect(rules().adjustBar(bar, { op: 'max', value: 60 })).toEqual({ current: 32, max: 60 });
  });
});

describe('TokenRulesBo.requireAt', () => {
  it('no precondition (a normal move) never refuses', () => {
    expect(() => rules().requireAt('lyra', undefined, { col: 9, row: 9 })).not.toThrow();
  });

  it('a precondition equal to where the token is passes (undo)', () => {
    expect(() => rules().requireAt('lyra', { col: 6, row: 4 }, { col: 6, row: 4 })).not.toThrow();
  });

  it('a token moved by someone else since is STALE_UNDO citing the token, expected and current', () => {
    expect(() => rules().requireAt('lyra', { col: 6, row: 4 }, { col: 2, row: 2 })).toThrow(
      expect.objectContaining({
        code: 'STALE_UNDO',
        message: 'token lyra is at (2, 2); the undo expected (6, 4)',
      }),
    );
  });
});

describe('requireFacing', () => {
  it('no precondition (a normal turn) never refuses', () => {
    expect(() => requireFacing('lyra', undefined, 180)).not.toThrow();
  });

  it('a precondition equal to where the token looks passes (undo)', () => {
    expect(() => requireFacing('lyra', 90, 90)).not.toThrow();
  });

  it('a token turned by someone else since is STALE_UNDO citing the token, 90 and 180', () => {
    expect(() => requireFacing('lyra', 90, 180)).toThrow(
      expect.objectContaining({
        code: 'STALE_UNDO',
        message: 'token lyra is at facing 180; the undo expected facing 90',
      }),
    );
  });
});

describe('requireBox', () => {
  const BOX = { col: 2, row: 3, width: 1, height: 1 };

  it('no expected box (a normal resize) passes', () => {
    expect(() => requireBox('lyra', undefined, BOX)).not.toThrow();
  });

  it('the expected box equal to the current one passes', () => {
    expect(() => requireBox('lyra', { ...BOX }, BOX)).not.toThrow();
  });

  it('a token resized since is STALE_UNDO citing the expected and the current box', () => {
    expect(() => requireBox('lyra', BOX, { ...BOX, width: 2 })).toThrow(
      expect.objectContaining({
        code: 'STALE_UNDO',
        message: expect.stringMatching(/2×1 at \(2, 3\).*1×1 at \(2, 3\)/),
      }),
    );
  });
});

describe('TokenRulesBo.requirePassage', () => {
  const ONE_CELL = { width: 1, height: 1 };
  const LYRA_FROM_1_5 = { col: 1, row: 5 };
  const LYRA_TO_4_5 = { col: 4, row: 5 };

  function wallsOf(...placed: PlacedWall[]): SceneWalls {
    return { placed, walls: placed.map(({ wall }) => wall) };
  }

  function verticalAt2(overrides: Partial<WallPo> = {}) {
    return placedWallOf(
      northWallPo({
        x: '2.00',
        y: '0.00',
        width: '0.00',
        height: '10.00',
        points: [
          [0, 0],
          [0, 10],
        ],
        ...overrides,
      }),
    );
  }

  it('a straight move across the wall is WALL_BLOCKED citing the token, the leg and the wall', () => {
    const wall = verticalAt2();
    expect(() =>
      rules().requirePassage('lyra', [LYRA_FROM_1_5, LYRA_TO_4_5], ONE_CELL, wallsOf(wall)),
    ).toThrow(
      expect.objectContaining({
        code: 'WALL_BLOCKED',
        message: `token lyra is barred on (1.5, 5.5) → (4.5, 5.5) by wall ${wall.id}`,
      }),
    );
  });

  it('going around the end of the wall through its bends passes', () => {
    const around = [LYRA_FROM_1_5, { col: 1, row: 10 }, { col: 4, row: 10 }, LYRA_TO_4_5];
    expect(() =>
      rules().requirePassage('lyra', around, ONE_CELL, wallsOf(verticalAt2())),
    ).not.toThrow();
  });

  it.each([
    ['grate', null, true],
    ['curtain', null, false],
    ['door', 'open', false],
    ['door', 'closed', true],
  ] as const)('a %s (%s) across the move bars it: %s', (kind, doorState, barred) => {
    const wall = verticalAt2({ kind, doorState });
    const check = () =>
      rules().requirePassage('lyra', [LYRA_FROM_1_5, LYRA_TO_4_5], ONE_CELL, wallsOf(wall));
    if (barred) expect(check).toThrow(expect.objectContaining({ code: 'WALL_BLOCKED' }));
    else expect(check).not.toThrow();
  });

  it('a bend past the scene is OUT_OF_SCENE citing the bend', () => {
    const outside = [LYRA_FROM_1_5, { col: 19.5, row: 5 }, LYRA_TO_4_5];
    expect(() => rules().requirePassage('lyra', outside, ONE_CELL, wallsOf())).toThrow(
      expect.objectContaining({
        code: 'OUT_OF_SCENE',
        message: expect.stringContaining('(19.5, 5)'),
      }),
    );
  });
});
