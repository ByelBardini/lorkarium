import { beforeEach, describe, expect, it } from 'vitest';
import { AdminSeedService } from '../../../src/modules/auth/admin-seed.service';
import { PasswordHasherFake, UsersDaoFake } from '../../support/auth-fakes';

const SEED = { email: 'root@lorkarium.dev', password: 'twelve-chars' };

describe('AdminSeedService', () => {
  let users: UsersDaoFake;
  let service: AdminSeedService;

  beforeEach(() => {
    users = new UsersDaoFake();
    service = new AdminSeedService(users, new PasswordHasherFake());
  });

  it('creates the configured admin with the password hashed', async () => {
    expect(await service.seed(SEED)).toBe('created');
    expect(users.inserted).toEqual([
      {
        name: 'Admin',
        email: 'root@lorkarium.dev',
        role: 'admin',
        passwordHash: 'hashed:twelve-chars',
      },
    ]);
  });

  it('a second run writes nothing', async () => {
    await service.seed(SEED);
    expect(await service.seed(SEED)).toBe('skipped');
    expect(users.inserted).toHaveLength(1);
  });

  it('without seed config nothing is written', async () => {
    expect(await service.seed(null)).toBe('skipped');
    expect(users.inserted).toEqual([]);
  });
});
