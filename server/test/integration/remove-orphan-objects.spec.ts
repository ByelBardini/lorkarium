import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { S3AssetStorage } from '../../src/infrastructure/asset-storage/s3-asset-storage';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { assets } from '../../src/modules/assets/assets.po';
import { OrphanObjectsService } from '../../src/modules/assets/orphan-objects.service';
import { StorageDeletionsDao } from '../../src/modules/assets/storage-deletions.dao';
import { storageDeletions } from '../../src/modules/assets/storage-deletions.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { newAssetPo } from '../support/assets-factories';
import { ClockFake } from '../support/auth-fakes';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
const DAY_AND_HOUR_MS = 25 * 60 * 60 * 1000;

describe('the orphan objects over Postgres and the S3', () => {
  let connection: DatabaseConnection;
  // A bucket of its own: the shared test bucket holds files of every other spec.
  const storage = new S3AssetStorage({
    ...readEnv(process.env).storage,
    bucket: `lorkarium-orphans-${randomUUID()}`,
  });

  beforeAll(async () => {
    connection = await openTestDatabase();
    await storage.ensureBucket();
  });

  beforeEach(() => truncateAllTables(connection.db));

  afterAll(async () => {
    storage.destroy();
    await connection.close();
  });

  async function campaignId(): Promise<string> {
    const owner = await new UsersDao(connection.db).insert(newUserPo());
    return (await new CampaignsDao(connection.db).insert(newCampaignPo({ ownerId: owner.id }))).id;
  }

  function serviceAt(now: Date): OrphanObjectsService {
    const assetsDao = new AssetsDao(connection.db);
    const deletions = new StorageDeletionsDao(connection.db);
    const clock = new ClockFake(now);
    return new OrphanObjectsService({ storage, assets: assetsDao, deletions, clock, chunkSize: 2 });
  }

  it('--yes queues only the old table file with neither a row nor a queued removal', async () => {
    const table = await campaignId();
    const [kept, queued, orphan] = ['kept', 'queued', 'orphan'].map(
      (name) => `assets/${name}-${randomUUID()}`,
    ) as [string, string, string];
    for (const key of [kept, queued, orphan, `avatars/${randomUUID()}`]) {
      await storage.put(key, PNG_BYTES, 'image/png');
    }
    await connection.db.insert(assets).values(newAssetPo({ campaignId: table, storageKey: kept }));
    await new StorageDeletionsDao(connection.db).enqueue([queued]);

    const later = new Date(Date.now() + DAY_AND_HOUR_MS);
    const report = await serviceAt(later).run({
      ...{ dryRun: false, confirmed: true, nodeEnv: 'test' },
    });

    expect(report).toEqual({ listed: 3, orphans: [orphan], enqueued: 1 });
    const rows = await connection.db.select().from(storageDeletions);
    expect(rows.map((row) => row.key).sort()).toEqual([orphan, queued].sort());
  });

  it('a file stored a moment ago is not an orphan yet', async () => {
    await storage.put(`assets/fresh-${randomUUID()}`, PNG_BYTES, 'image/png');

    const report = await serviceAt(new Date()).run({
      ...{ dryRun: true, confirmed: false, nodeEnv: 'test' },
    });

    expect(report.orphans).toEqual([]);
  });
});
