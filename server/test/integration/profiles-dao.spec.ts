import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { ProfilesDao } from '../../src/modules/profiles/profiles.dao';
import { newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const FIRST = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const SECOND = 'd2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f60';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('ProfilesDao on Postgres', () => {
  let connection: DatabaseConnection;
  let profiles: ProfilesDao;
  let anaId: string;
  let biaId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    profiles = new ProfilesDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const users = new UsersDao(connection.db);
    anaId = (await users.insert(newUserPo({ name: 'Ana', email: 'ana@mesa.com' }))).id;
    biaId = (await users.insert(newUserPo({ name: 'Bia', email: 'bia@mesa.com' }))).id;
  });

  afterAll(() => connection.close());

  it('the row read carries the @ and the profile columns, never the e-mail nor the hash', async () => {
    const row = await profiles.findById(anaId);

    expect(row).toMatchObject({ id: anaId, username: 'ana', name: 'Ana', color: null });
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ['avatarId', 'bio', 'color', 'createdAt', 'id', 'name', 'username'].sort(),
    );
  });

  it('update writes only the fields given and only on that account', async () => {
    const row = await profiles.update(anaId, { color: 'rose' });

    expect(row).toMatchObject({ name: 'Ana', color: 'rose' });
    expect(await profiles.findById(biaId)).toMatchObject({ name: 'Bia', color: null });
  });

  it('a bio above 190 characters is refused by the check of the table', async () => {
    await expect(profiles.update(anaId, { bio: 'x'.repeat(191) })).rejects.toMatchObject({
      cause: { code: '23514' },
    });
  });

  it('swapAvatar answers the photo the account had, and the new one becomes current', async () => {
    expect(await profiles.swapAvatar(anaId, FIRST)).toEqual({ previousAvatarId: null });

    expect(await profiles.swapAvatar(anaId, SECOND)).toEqual({ previousAvatarId: FIRST });
    expect(await profiles.isCurrentAvatar(FIRST)).toBe(false);
    expect(await profiles.isCurrentAvatar(SECOND)).toBe(true);
  });

  it('two sends at once each see a different previous photo, so none is left behind', async () => {
    await profiles.swapAvatar(anaId, FIRST);

    const answers = await Promise.all([
      profiles.swapAvatar(anaId, SECOND),
      profiles.swapAvatar(anaId, UNKNOWN_ID),
    ]);

    const previous = answers.map((answer) => answer?.previousAvatarId).sort();
    const current = (await profiles.findById(anaId))?.avatarId;
    expect(previous).toContain(FIRST);
    expect(new Set([...previous, current]).size).toBe(3);
  });

  it('swapAvatar of an account that does not exist answers undefined', async () => {
    expect(await profiles.swapAvatar(UNKNOWN_ID, FIRST)).toBeUndefined();
  });
});
