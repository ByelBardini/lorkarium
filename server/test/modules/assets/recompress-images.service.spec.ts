import { beforeEach, describe, expect, it } from 'vitest';
import type { AssetPo } from '../../../src/modules/assets/assets.po';
import {
  RecompressImagesService,
  type RecompressRun,
} from '../../../src/modules/assets/recompress-images.service';
import { AssetStorageFake, ImageProcessorFake } from '../../support/assets-fakes';
import { lyraPortraitPo } from '../../support/assets-factories';
import { FailingPutStorageFake, RecompressAssetsDaoFake } from '../../support/recompress-fakes';

const MAP_ID = '6c5d4e3f-2a1b-4c0d-9e8f-7a6b5c4d3e2f';
const PNG_BYTES = Uint8Array.from({ length: 900 }, (_, at) => at % 251);
const WEBP_BYTES = Uint8Array.from([7, 7, 7, 7]);
const RUN: RecompressRun = { dryRun: false, nodeEnv: 'development', confirmed: false };

function vharnMapPo(overrides: Partial<AssetPo> = {}): AssetPo {
  return lyraPortraitPo({
    id: MAP_ID,
    purpose: 'library_map',
    sizeBytes: PNG_BYTES.byteLength,
    storageKey: `assets/${MAP_ID}`,
    ...overrides,
  });
}

describe('RecompressImagesService', () => {
  let journal: string[];
  let assets: RecompressAssetsDaoFake;
  let storage: AssetStorageFake;
  let processor: ImageProcessorFake;

  function serviceWith(bucket: AssetStorageFake = storage): RecompressImagesService {
    return new RecompressImagesService({ assets, storage: bucket, processor });
  }

  beforeEach(async () => {
    journal = [];
    assets = new RecompressAssetsDaoFake([vharnMapPo()], journal);
    storage = new AssetStorageFake(journal);
    await storage.put(`assets/${MAP_ID}`, PNG_BYTES, 'image/png');
    journal.length = 0;
    processor = new ImageProcessorFake(journal);
    processor.result = {
      bytes: WEBP_BYTES,
      mimeType: 'image/webp',
      width: 400,
      height: 400,
      outline: null,
    };
  });

  it('an opaque PNG map is put back as WebP under the same key, then its row follows', async () => {
    const report = await serviceWith().run(RUN);

    expect(journal).toEqual(['normalize', 'put', `update:${MAP_ID}`]);
    expect(storage.objects.get(`assets/${MAP_ID}`)).toEqual({
      bytes: WEBP_BYTES,
      contentType: 'image/webp',
    });
    expect(assets.rows[0]).toMatchObject({ mimeType: 'image/webp', sizeBytes: 4, width: 400 });
    expect(report).toEqual({
      examined: 1,
      converted: 1,
      skipped: 0,
      failed: [],
      bytesBefore: 900,
      bytesAfter: 4,
    });
  });

  it('the processor is asked for the opaque WebP within the side of the purpose', async () => {
    await serviceWith().run(RUN);

    expect(processor.resizes).toEqual([{ maxSide: 8192, opaqueAsWebp: true }]);
  });

  it('a PNG with transparency (the processor keeps it PNG) is skipped without a write', async () => {
    processor.result = { ...processor.result, mimeType: 'image/png' };

    const report = await serviceWith().run(RUN);

    expect(journal).toEqual(['normalize']);
    expect(report).toMatchObject({ examined: 1, converted: 0, skipped: 1 });
  });

  it('a PNG token is not a purpose kept as WebP: skipped before it is even read', async () => {
    assets.rows = [vharnMapPo({ purpose: 'token' })];

    const report = await serviceWith().run(RUN);

    expect(journal).toEqual([]);
    expect(report).toMatchObject({ examined: 1, converted: 0, skipped: 1 });
  });

  it('a WebP that would weigh more than the PNG is skipped', async () => {
    processor.result = { ...processor.result, bytes: new Uint8Array(PNG_BYTES.byteLength + 1) };

    const report = await serviceWith().run(RUN);

    expect(journal).toEqual(['normalize']);
    expect(report).toMatchObject({ converted: 0, skipped: 1 });
  });

  it('a dry run converts in memory, reports the gain and writes nothing', async () => {
    const report = await serviceWith().run({ ...RUN, dryRun: true });

    expect(journal).toEqual(['normalize']);
    expect(assets.rows[0]?.mimeType).toBe('image/png');
    expect(report).toMatchObject({ converted: 1, bytesBefore: 900, bytesAfter: 4 });
  });

  it('a second run finds no PNG left and converts nothing', async () => {
    await serviceWith().run(RUN);
    journal.length = 0;

    const report = await serviceWith().run(RUN);

    expect(journal).toEqual([]);
    expect(report).toEqual({
      examined: 0,
      converted: 0,
      skipped: 0,
      failed: [],
      bytesBefore: 0,
      bytesAfter: 0,
    });
  });

  it('an S3 failure on the put leaves the row untouched and lists the asset with the reason', async () => {
    const failing = new FailingPutStorageFake(journal);
    failing.objects.set(`assets/${MAP_ID}`, { bytes: PNG_BYTES, contentType: 'image/png' });

    const report = await serviceWith(failing).run(RUN);

    expect(assets.rows[0]?.mimeType).toBe('image/png');
    expect(journal).not.toContain(`update:${MAP_ID}`);
    expect(report.failed).toEqual([
      { assetId: MAP_ID, reason: expect.stringContaining('503 SlowDown') },
    ]);
    expect(report).toMatchObject({ converted: 0 });
  });

  it('an object missing from the S3 is listed as failed, and the run goes on', async () => {
    storage.objects.clear();

    const report = await serviceWith().run(RUN);

    expect(report.failed).toEqual([
      { assetId: MAP_ID, reason: `no object under assets/${MAP_ID}` },
    ]);
  });

  it('bytes the processor refuses are listed as failed with its words', async () => {
    processor.refusal = {
      reason: 'not-an-image',
      detail: 'the 900 bytes do not decode as an image',
    };

    const report = await serviceWith().run(RUN);

    expect(report.failed).toEqual([
      { assetId: MAP_ID, reason: 'the 900 bytes do not decode as an image' },
    ]);
  });

  it('in production without --yes the run is refused citing the flag, before any read', async () => {
    const run = serviceWith().run({ ...RUN, nodeEnv: 'production' });

    await expect(run).rejects.toMatchObject({
      code: 'RECOMPRESS_IMAGES_REFUSED',
      message: expect.stringContaining('--yes'),
    });
    expect(journal).toEqual([]);
  });

  it('in production with --yes the run converts', async () => {
    const report = await serviceWith().run({ ...RUN, nodeEnv: 'production', confirmed: true });

    expect(report.converted).toBe(1);
  });

  it('in production a dry run needs no --yes: it writes nothing', async () => {
    const report = await serviceWith().run({ ...RUN, nodeEnv: 'production', dryRun: true });

    expect(report.converted).toBe(1);
    expect(journal).toEqual(['normalize']);
  });
});
