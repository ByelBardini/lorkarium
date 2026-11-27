import { PLAN_LIMITS, savedTokenLimitsOf } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SavedTokenRulesBo } from '../../../src/modules/saved-tokens/saved-token.bo';

const rules = new SavedTokenRulesBo({ tokens: 50, folders: 20 });
const FREE_TABLE = { limits: PLAN_LIMITS.free, holder: 'table' as const };
const APOIADOR = savedTokenLimitsOf(PLAN_LIMITS.free, 'apoiador');
const LENDA = { limits: PLAN_LIMITS.lenda, holder: 'table' as const };

describe('SavedTokenRulesBo.requireRoomFor', () => {
  it('a Grátis table refuses the first saved token: PLAN_LIMIT savedTokens, limit 0', () => {
    expect(() => rules.requireRoomFor(0, FREE_TABLE)).toThrow(
      expect.objectContaining({ code: 'PLAN_LIMIT', resource: 'savedTokens', limit: 0 }),
    );
  });

  it('an Apoiador at a Grátis table keeps a 5th, and the 6th names the account', () => {
    expect(() => rules.requireRoomFor(4, APOIADOR)).not.toThrow();
    expect(() => rules.requireRoomFor(5, APOIADOR)).toThrow(
      expect.objectContaining({ resource: 'savedTokens', limit: 5, holder: 'account' }),
    );
  });

  it('past the technical ceiling the 51st is SAVED_TOKENS_LIMIT citing 51 of 50', () => {
    expect(() => rules.requireRoomFor(50, LENDA)).toThrow(
      expect.objectContaining({
        code: 'SAVED_TOKENS_LIMIT',
        message: expect.stringContaining('51 of 50'),
      }),
    );
  });
});

describe('SavedTokenRulesBo.requireFolderRoom', () => {
  it('a Grátis table keeps no folder: PLAN_LIMIT savedTokenFolders, limit 0', () => {
    expect(() => rules.requireFolderRoom(0, FREE_TABLE)).toThrow(
      expect.objectContaining({ resource: 'savedTokenFolders', limit: 0 }),
    );
  });

  it('an Apoiador keeps 2 folders and the 3rd is refused', () => {
    expect(() => rules.requireFolderRoom(1, APOIADOR)).not.toThrow();
    expect(() => rules.requireFolderRoom(2, APOIADOR)).toThrow(
      expect.objectContaining({ resource: 'savedTokenFolders', limit: 2, holder: 'account' }),
    );
  });

  it('the 21st folder on Lenda is SAVED_TOKEN_FOLDERS_LIMIT', () => {
    expect(() => rules.requireFolderRoom(20, LENDA)).toThrow(
      expect.objectContaining({ code: 'SAVED_TOKEN_FOLDERS_LIMIT' }),
    );
  });
});

describe('SavedTokenRulesBo, read only past the plan', () => {
  it('for an Apoiador the 5th (rank 4) is editable and the 6th (rank 5) is read only', () => {
    expect(() => rules.requireConfigurable(4, APOIADOR)).not.toThrow();
    expect(() => rules.requireConfigurable(5, APOIADOR)).toThrow(
      expect.objectContaining({ code: 'PLAN_LIMIT', reason: 'readOnly', resource: 'savedTokens' }),
    );
  });

  it('isPlanLocked marks the same ranks without throwing', () => {
    expect([4, 5].map((rank) => rules.isPlanLocked(rank, APOIADOR))).toEqual([false, true]);
  });
});
