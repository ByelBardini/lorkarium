import { describe, expect, it } from 'vitest';
import {
  deletionVerdict,
  requireOtherAccount,
} from '../../../src/modules/user-admin/user-admin.bo';

describe('requireOtherAccount', () => {
  it('an admin acting on their own account is SELF_ACTION citing the id and the action', () => {
    expect(() => requireOtherAccount('admin-1', 'admin-1', 'suspend')).toThrow(
      expect.objectContaining({
        code: 'SELF_ACTION',
        message: expect.stringMatching(/admin-1 cannot suspend/),
      }),
    );
  });

  it('acting on another account passes', () => {
    expect(() => requireOtherAccount('admin-1', 'bia', 'delete')).not.toThrow();
  });
});

describe('deletionVerdict', () => {
  it('a table with other members blocks it, naming only that table', () => {
    const verdict = deletionVerdict([
      { id: 'vharn', name: 'Vharn', otherMembers: 0 },
      { id: 'quelm', name: 'Quelm', otherMembers: 2 },
    ]);
    expect(verdict).toEqual({
      kind: 'blocked',
      blockingCampaigns: [{ id: 'quelm', name: 'Quelm', otherMembers: 2 }],
    });
  });

  it('only solo tables allow it, counting them', () => {
    const verdict = deletionVerdict([
      { id: 'a', name: 'A', otherMembers: 0 },
      { id: 'b', name: 'B', otherMembers: 0 },
    ]);
    expect(verdict).toEqual({ kind: 'allowed', soloCampaigns: 2 });
  });

  it('no table allows it with 0', () => {
    expect(deletionVerdict([])).toEqual({ kind: 'allowed', soloCampaigns: 0 });
  });
});
