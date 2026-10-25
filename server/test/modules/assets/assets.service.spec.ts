import type { Readable } from 'node:stream';
import { beforeEach, describe, expect, it } from 'vitest';
import { AssetsService } from '../../../src/modules/assets/assets.service';
import { ANA_ID } from '../../support/auth-factories';
import {
  AssetsDaoFake,
  AssetStorageFake,
  ImageFetcherFake,
  ImageProcessorFake,
} from '../../support/assets-fakes';
import { lyraPortraitPo, QUELM_MAP_ID } from '../../support/assets-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';

const NEW_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 7, 7]);
const MIB = 1024 * 1024;

async function bytesOf(stream: Readable): Promise<number[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return [...Buffer.concat(chunks)];
}

describe('AssetsService', () => {
  let journal: string[];
  let storage: AssetStorageFake;
  let processor: ImageProcessorFake;
  let fetcher: ImageFetcherFake;
  let assets: AssetsDaoFake;
  let service: AssetsService;

  beforeEach(() => {
    journal = [];
    storage = new AssetStorageFake(journal);
    processor = new ImageProcessorFake(journal);
    fetcher = new ImageFetcherFake();
    assets = new AssetsDaoFake(journal);
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
    ]);
    service = new AssetsService({
      members,
      assets,
      storage,
      processor,
      fetcher,
      newId: () => NEW_ID,
    });
  });

  it('a member sending a token PNG gets it normalized, stored, recorded and answered', async () => {
    const asset = await service.upload(BIA_ID, VHARN_ID, { bytes: PNG, purpose: 'token' });

    expect(asset).toEqual({ id: NEW_ID, mimeType: 'image/png', width: 1024, height: 512 });
    expect(journal).toEqual(['normalize', 'put', 'insert']);
    expect(processor.resizes).toEqual([{ maxSide: 1024, square: false }]);
    expect(storage.objects.get(`assets/${NEW_ID}`)?.bytes).toEqual(processor.result.bytes);
    expect(assets.rows[0]).toMatchObject({ ownerId: BIA_ID, campaignId: VHARN_ID, sizeBytes: 6 });
  });

  it('a background is normalized up to 4096 px', async () => {
    await service.upload(ANA_ID, VHARN_ID, { bytes: PNG, purpose: 'background' });

    expect(processor.resizes).toEqual([{ maxSide: 4096, square: false }]);
  });

  it('a condition file is normalized as a square of 256 px, then stored and recorded', async () => {
    await service.upload(BIA_ID, VHARN_ID, { bytes: PNG, purpose: 'condition' });

    expect(processor.resizes).toEqual([{ maxSide: 256, square: true }]);
    expect(journal).toEqual(['normalize', 'put', 'insert']);
  });

  it('a condition link is normalized as a square of 256 px, then stored and recorded', async () => {
    const link = { url: 'https://x.com/blind.png', purpose: 'condition' } as const;

    await service.importLink(BIA_ID, VHARN_ID, link);

    expect(processor.resizes).toEqual([{ maxSide: 256, square: true }]);
    expect(journal).toEqual(['normalize', 'put', 'insert']);
  });

  it('someone outside the campaign is refused with CAMPAIGN_NOT_FOUND before anything is kept', async () => {
    const upload = service.upload(CAIO_ID, VHARN_ID, { bytes: PNG, purpose: 'token' });

    await expect(upload).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
    expect(journal).toEqual([]);
  });

  it('a file the processor refuses is UNSUPPORTED_IMAGE and nothing is stored', async () => {
    processor.refusal = { reason: 'format', detail: 'format gif is not kept; expected png' };

    const upload = service.upload(BIA_ID, VHARN_ID, { bytes: PNG, purpose: 'token' });

    await expect(upload).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE' });
    expect(journal).toEqual(['normalize']);
  });

  it('a file above 20 MiB is ASSET_TOO_LARGE citing size and limit, before decoding', async () => {
    const bytes = new Uint8Array(20 * MIB + 1);

    const upload = service.upload(BIA_ID, VHARN_ID, { bytes, purpose: 'token' });

    await expect(upload).rejects.toMatchObject({ code: 'ASSET_TOO_LARGE' });
    await expect(upload).rejects.toThrow(`${20 * MIB + 1} bytes; expected at most ${20 * MIB}`);
    expect(journal).toEqual([]);
  });

  it('a link is fetched and then kept the same way as a file', async () => {
    const link = { url: 'https://x.com/lyra.png', purpose: 'token' } as const;

    const asset = await service.importLink(BIA_ID, VHARN_ID, link);

    expect(fetcher.fetched).toEqual(['https://x.com/lyra.png']);
    expect(asset.id).toBe(NEW_ID);
    expect(journal).toEqual(['normalize', 'put', 'insert']);
  });

  it('a link whose answer the processor refuses is LINK_NOT_IMAGE, not UNSUPPORTED_IMAGE', async () => {
    processor.refusal = { reason: 'not-an-image', detail: 'the 9 bytes do not decode' };

    const imported = service.importLink(BIA_ID, VHARN_ID, {
      url: 'https://www.google.com/search?q=lyra',
      purpose: 'token',
    });

    await expect(imported).rejects.toMatchObject({ code: 'LINK_NOT_IMAGE' });
    expect(journal).not.toContain('put');
  });

  it('a link the fetcher blocks is LINK_BLOCKED and nothing is decoded', async () => {
    fetcher.refusal = { kind: 'blocked', host: '169.254.169.254', address: '169.254.169.254' };

    const imported = service.importLink(BIA_ID, VHARN_ID, {
      url: 'http://169.254.169.254/latest',
      purpose: 'token',
    });

    await expect(imported).rejects.toMatchObject({ code: 'LINK_BLOCKED' });
    expect(journal).toEqual([]);
  });

  it('a member opens an asset of the campaign with its bytes, size and recorded type', async () => {
    assets.rows.push(lyraPortraitPo({ mimeType: 'image/webp' }));
    storage.objects.set(lyraPortraitPo().storageKey, { bytes: PNG, contentType: 'image/png' });

    const opened = await service.open(BIA_ID, lyraPortraitPo().id);

    expect(opened.mimeType).toBe('image/webp');
    expect(opened.size).toBe(6);
    expect(await bytesOf(opened.body)).toEqual([...PNG]);
  });

  it('an asset of another campaign is ASSET_NOT_FOUND, the same as one that does not exist', async () => {
    assets.rows.push(lyraPortraitPo());
    storage.objects.set(lyraPortraitPo().storageKey, { bytes: PNG, contentType: 'image/png' });

    await expect(service.open(CAIO_ID, lyraPortraitPo().id)).rejects.toMatchObject({
      code: 'ASSET_NOT_FOUND',
    });
    await expect(service.open(CAIO_ID, QUELM_MAP_ID)).rejects.toMatchObject({
      code: 'ASSET_NOT_FOUND',
    });
  });

  it('an asset whose object vanished from the S3 is ASSET_NOT_FOUND', async () => {
    assets.rows.push(lyraPortraitPo());

    await expect(service.open(BIA_ID, lyraPortraitPo().id)).rejects.toMatchObject({
      code: 'ASSET_NOT_FOUND',
    });
  });

  it('a link answering above 20 MiB is ASSET_TOO_LARGE, cut before decoding', async () => {
    fetcher.refusal = { kind: 'too-large', limit: 20 * MIB, received: null };

    const imported = service.importLink(BIA_ID, VHARN_ID, {
      url: 'https://x.com/huge.png',
      purpose: 'token',
    });

    await expect(imported).rejects.toMatchObject({ code: 'ASSET_TOO_LARGE' });
    expect(journal).toEqual([]);
  });

  it('a link that cannot be reached is LINK_UNREACHABLE citing the link and why', async () => {
    fetcher.refusal = { kind: 'unreachable', reason: 'answered HTTP 404' };

    const imported = service.importLink(BIA_ID, VHARN_ID, {
      url: 'https://x.com/gone.png',
      purpose: 'token',
    });

    await expect(imported).rejects.toMatchObject({ code: 'LINK_UNREACHABLE' });
    await expect(imported).rejects.toThrow('link https://x.com/gone.png answered HTTP 404');
  });

  it('an upload refused by the processor carries its words in the error', async () => {
    processor.refusal = {
      reason: 'too-many-pixels',
      detail: 'the image has 2000 pixels; expected png',
    };

    const upload = service.upload(BIA_ID, VHARN_ID, { bytes: PNG, purpose: 'token' });

    await expect(upload).rejects.toThrow('the image has 2000 pixels; expected png');
  });
});
