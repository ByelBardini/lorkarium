import { describe, expect, it } from 'vitest';
import { TokenRulesBo, requireFacing } from '../../../src/modules/tokens/token-rules.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';

const SCENE = { widthCells: 20, heightCells: 12 };
const LIMIT = 99_999;
const MEMBERS = [ANA_ID, BIA_ID];

function rules(): TokenRulesBo {
  return new TokenRulesBo({ scene: SCENE, memberIds: MEMBERS, barLimit: LIMIT });
}

describe('TokenRulesBo', () => {
  it('a size 2 token placed at (18, 10) stays inside the scene', () => {
    expect(rules().place({ col: 18, row: 10 }, 2)).toEqual({ col: 18, row: 10 });
  });

  it('a token placed past the edge is refused with OUT_OF_SCENE citing the cell and the scene', () => {
    expect(() => rules().place({ col: 20, row: 0 }, 1)).toThrow(
      expect.objectContaining({
        code: 'OUT_OF_SCENE',
        message: expect.stringMatching(/\(20, 0\).*size 1.*20×12/),
      }),
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

  it('adjusting a bar applies the change and may go negative', () => {
    expect(rules().adjustBar(3, { op: 'add', amount: -10 })).toBe(-7);
    expect(rules().adjustBar(32, { op: 'set', value: 12 })).toBe(12);
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
