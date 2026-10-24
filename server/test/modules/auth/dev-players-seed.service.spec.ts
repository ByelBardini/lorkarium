import { describe, expect, it } from 'vitest';
import { DevPlayersSeedService } from '../../../src/modules/auth/dev-players-seed.service';
import { DataCipherFake, PasswordHasherFake, UsersDaoFake } from '../../support/auth-fakes';
import { userPo } from '../../support/auth-factories';

const CAIO_ID = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

function seedOver(users: UsersDaoFake): DevPlayersSeedService {
  const deps = { users, hasher: new PasswordHasherFake(), cipher: new DataCipherFake() };
  return new DevPlayersSeedService({ ...deps, newId: () => CAIO_ID });
}

describe('DevPlayersSeedService', () => {
  it('writes only the missing player as @caio, with the dev password hashed and the e-mail sealed', async () => {
    const bia = userPo({ name: 'Bia', email: 'bia@lorkarium.dev', passwordHash: 'kept' });
    const users = new UsersDaoFake([bia]);
    const result = await seedOver(users).seed('development');
    expect(result).toEqual({ created: ['caio@lorkarium.dev'], skipped: ['bia@lorkarium.dev'] });
    expect(users.inserted).toEqual([
      {
        id: CAIO_ID,
        username: 'caio',
        name: 'Caio',
        role: 'user',
        emailCipher: `sealed:user-email:${CAIO_ID}:caio@lorkarium.dev`,
        emailIndex: 'idx:email-index:caio@lorkarium.dev',
        passwordHash: 'hashed:lorkarium-dev',
      },
    ]);
  });

  it('looks the players up by the blind index of their e-mails', async () => {
    const users = new UsersDaoFake();
    await seedOver(users).seed('development');
    expect(users.lookedUp).toEqual([
      'idx:email-index:bia@lorkarium.dev',
      'idx:email-index:caio@lorkarium.dev',
    ]);
  });

  it('in production it refuses before looking any account up', async () => {
    const users = new UsersDaoFake();
    const seed = seedOver(users).seed('production');
    await expect(seed).rejects.toThrow(expect.objectContaining({ code: 'DEV_SEED_REFUSED' }));
    expect(users.lookedUp).toEqual([]);
    expect(users.rows).toEqual([]);
  });
});
