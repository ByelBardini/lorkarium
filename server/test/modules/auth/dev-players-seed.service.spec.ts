import { describe, expect, it } from 'vitest';
import { DevPlayersSeedService } from '../../../src/modules/auth/dev-players-seed.service';
import { PasswordHasherFake, UsersDaoFake } from '../../support/auth-fakes';
import { userPo } from '../../support/auth-factories';

describe('DevPlayersSeedService', () => {
  it('writes only the missing player, with the dev password hashed', async () => {
    const bia = userPo({ name: 'Bia', email: 'bia@lorkarium.dev', passwordHash: 'kept' });
    const users = new UsersDaoFake([bia]);
    const result = await new DevPlayersSeedService(users, new PasswordHasherFake()).seed(
      'development',
    );
    expect(result).toEqual({ created: ['caio@lorkarium.dev'], skipped: ['bia@lorkarium.dev'] });
    expect(users.inserted).toEqual([
      {
        name: 'Caio',
        email: 'caio@lorkarium.dev',
        role: 'user',
        passwordHash: 'hashed:lorkarium-dev',
      },
    ]);
  });

  it('in production it refuses before looking any account up', async () => {
    const users = new UsersDaoFake();
    const seed = new DevPlayersSeedService(users, new PasswordHasherFake()).seed('production');
    await expect(seed).rejects.toThrow(expect.objectContaining({ code: 'DEV_SEED_REFUSED' }));
    expect(users.lookedUp).toEqual([]);
    expect(users.rows).toEqual([]);
  });
});
