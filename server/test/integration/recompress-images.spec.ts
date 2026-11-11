import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { SharpImageProcessor } from '../../src/infrastructure/image-processor/sharp-image-processor';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import type { AssetPo, NewAssetPo } from '../../src/modules/assets/assets.po';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { RecompressImagesService } from '../../src/modules/assets/recompress-images.service';
import { AssetStorageFake } from '../support/assets-fakes';
import { newAssetPo } from '../support/assets-factories';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const RUN = { dryRun: false, nodeEnv: 'test', confirmed: false };

// Noise, so the PNG is as heavy as a painted map and the WebP is clearly lighter.
async function paintedPng(alpha: boolean): Promise<Uint8Array> {
  const noise = { type: 'gaussian' as const, mean: 128, sigma: 60 };
  const image = sharp({
    create: { width: 320, height: 200, channels: 3, background: '#336699', noise },
  });
  const png = await image.png().toBuffer();
  if (!alpha) return new Uint8Array(png);
  const holed = sharp(png).ensureAlpha(0.4);
  return new Uint8Array(await holed.png().toBuffer());
}

async function webp(): Promise<Uint8Array> {
  const image = sharp({ create: { width: 64, height: 64, channels: 3, background: '#aa3311' } });
  return new Uint8Array(await image.webp().toBuffer());
}

describe('pnpm db:recompress-images on Postgres', () => {
  let connection: DatabaseConnection;
  let dao: AssetsDao;
  let storage: AssetStorageFake;
  let service: RecompressImagesService;
  let campaignId: string;

  async function stored(bytes: Uint8Array, overrides: Partial<NewAssetPo>): Promise<AssetPo> {
    const row = await dao.insert(
      newAssetPo({ campaignId, sizeBytes: bytes.byteLength, ...overrides }),
    );
    await storage.put(row.storageKey, bytes, row.mimeType);
    return row;
  }

  beforeAll(async () => {
    connection = await openTestDatabase();
    dao = new AssetsDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const ownerId = (await new UsersDao(connection.db).insert(newUserPo())).id;
    campaignId = (await new CampaignsDao(connection.db).insert(newCampaignPo({ ownerId }))).id;
    storage = new AssetStorageFake();
    service = new RecompressImagesService({
      assets: dao,
      storage,
      processor: new SharpImageProcessor(),
    });
  });

  afterAll(() => connection.close());

  it('an opaque PNG background becomes a WebP under the same key, with its row updated', async () => {
    const png = await paintedPng(false);
    const row = await stored(png, { purpose: 'background', width: 320, height: 200 });

    const report = await service.run(RUN);

    const kept = storage.objects.get(row.storageKey);
    expect(kept?.contentType).toBe('image/webp');
    expect((await sharp(kept?.bytes).metadata()).format).toBe('webp');
    expect(await dao.findById(row.id)).toMatchObject({
      mimeType: 'image/webp',
      sizeBytes: kept?.bytes.byteLength,
      width: 320,
      height: 200,
    });
    expect(report).toMatchObject({ examined: 1, converted: 1, bytesBefore: png.byteLength });
  });

  it('a transparent PNG map, a WebP and a PNG token are left as they were', async () => {
    const holed = await stored(await paintedPng(true), { purpose: 'library_map' });
    const still = await stored(await webp(), { purpose: 'background', mimeType: 'image/webp' });
    const token = await stored(await paintedPng(false), { purpose: 'token' });

    const report = await service.run(RUN);

    expect(report).toMatchObject({ examined: 2, converted: 0, skipped: 2, failed: [] });
    for (const row of [holed, still, token]) {
      expect((await dao.findById(row.id))?.mimeType).toBe(row.mimeType);
    }
  });

  it('a dry run writes nothing, and a second real run converts nothing', async () => {
    const row = await stored(await paintedPng(false), { purpose: 'library_image' });

    expect((await service.run({ ...RUN, dryRun: true })).converted).toBe(1);
    expect((await dao.findById(row.id))?.mimeType).toBe('image/png');
    await service.run(RUN);

    expect(await service.run(RUN)).toMatchObject({ examined: 0, converted: 0 });
  });
});
