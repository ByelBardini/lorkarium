import { describe, expect, it } from 'vitest';
import { AdminSeedBo } from '../../../src/modules/auth/admin-seed.bo';
import { userPo } from '../../support/auth-factories';

const SEED = { email: 'root@lorkarium.dev', password: 'twelve-chars' };

describe('AdminSeedBo', () => {
  it('without seed config the decision is skip', () => {
    expect(new AdminSeedBo(undefined).decide(null)).toEqual({ kind: 'skip' });
  });

  it('an e-mail that already exists is skipped, so its password is never overwritten', () => {
    const existing = userPo({ email: 'root@lorkarium.dev', role: 'user' });
    expect(new AdminSeedBo(existing).decide(SEED)).toEqual({ kind: 'skip' });
  });

  it('an absent e-mail is created as admin', () => {
    expect(new AdminSeedBo(undefined).decide(SEED)).toEqual({
      kind: 'create',
      user: { name: 'Admin', email: 'root@lorkarium.dev', role: 'admin' },
    });
  });
});
