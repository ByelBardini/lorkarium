import { beforeEach, describe, expect, it } from 'vitest';
import { AdminSeedService } from '../../../src/modules/auth/admin-seed.service';
import { DataCipherFake, PasswordHasherFake, UsersDaoFake } from '../../support/auth-fakes';
import { userPo } from '../../support/auth-factories';

const SEED = { email: 'root@lorkarium.dev', password: 'twelve-chars' };
const ADMIN_ID = '0f6c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

describe('AdminSeedService', () => {
  let users: UsersDaoFake;
  let service: AdminSeedService;

  beforeEach(() => {
    users = new UsersDaoFake();
    const deps = { users, hasher: new PasswordHasherFake(), cipher: new DataCipherFake() };
    service = new AdminSeedService({ ...deps, newId: () => ADMIN_ID });
  });

  it('creates @admin with the password hashed and the e-mail only sealed, bound to its id', async () => {
    expect(await service.seed(SEED)).toBe('created');
    expect(users.inserted).toEqual([
      {
        id: ADMIN_ID,
        username: 'admin',
        name: 'admin',
        role: 'admin',
        emailCipher: `sealed:user-email:${ADMIN_ID}:root@lorkarium.dev`,
        emailIndex: 'idx:email-index:root@lorkarium.dev',
        passwordHash: 'hashed:twelve-chars',
      },
    ]);
  });

  it('looks the admin up by the blind index, never by the e-mail in clear', async () => {
    await service.seed(SEED);
    expect(users.lookedUp).toEqual(['idx:email-index:root@lorkarium.dev']);
  });

  it('with @admin taken by a person the admin is born @admin2', async () => {
    users.rows.push(userPo({ email: 'admin@mesa.com' }));
    await service.seed(SEED);
    expect(users.inserted[0]).toMatchObject({ username: 'admin2', name: 'admin2' });
  });

  it('a second run writes nothing', async () => {
    await service.seed(SEED);
    expect(await service.seed(SEED)).toBe('skipped');
    expect(users.inserted).toHaveLength(1);
  });

  it('without seed config nothing is looked up nor written', async () => {
    expect(await service.seed(null)).toBe('skipped');
    expect(users.lookedUp).toEqual([]);
    expect(users.inserted).toEqual([]);
  });
});
