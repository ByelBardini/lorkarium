import { describe, expect, it } from 'vitest';
import { AdminSeedBo } from '../../../src/modules/auth/admin-seed.bo';
import { userPo } from '../../support/auth-factories';

const SEED = { email: 'root@lorkarium.dev', password: 'twelve-chars' };
const NONE_TAKEN: ReadonlySet<string> = new Set();

describe('AdminSeedBo', () => {
  it('without seed config the decision is skip', () => {
    expect(new AdminSeedBo(undefined, NONE_TAKEN).decide(null)).toEqual({ kind: 'skip' });
  });

  it('an e-mail that already exists is skipped, so its password is never overwritten', () => {
    const existing = userPo({ email: 'root@lorkarium.dev', role: 'user' });
    expect(new AdminSeedBo(existing, NONE_TAKEN).decide(SEED)).toEqual({ kind: 'skip' });
  });

  it('an absent e-mail is created as @admin, whatever the e-mail, with the nickname equal to the @', () => {
    expect(new AdminSeedBo(undefined, NONE_TAKEN).decide(SEED)).toEqual({
      kind: 'create',
      user: { username: 'admin', name: 'admin', email: 'root@lorkarium.dev', role: 'admin' },
    });
  });

  it('with @admin already taken by a person the admin is born @admin2', () => {
    const decision = new AdminSeedBo(undefined, new Set(['admin'])).decide(SEED);
    expect(decision).toMatchObject({ user: { username: 'admin2', name: 'admin2' } });
  });
});
