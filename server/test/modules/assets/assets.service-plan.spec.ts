import { PLAN_LIMITS } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { AssetsService } from '../../../src/modules/assets/assets.service';
import { assetQuotaOver, QUOTA_NOW, type AssetQuotaHarness } from '../../support/asset-quota-fakes';
import {
  AssetsDaoFake,
  AssetStorageFake,
  ImageFetcherFake,
  ImageProcessorFake,
} from '../../support/assets-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { planAccount } from '../../support/plan-account-fakes';

const NEW_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 7, 7]);
const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00]);
const KEPT_BYTES = 6; // what ImageProcessorFake answers
const FREE_STORAGE = PLAN_LIMITS.free.maxStorageBytes ?? 0;
const GIB = 1024 * 1024 * 1024;

describe('AssetsService under the plan of the table owner', () => {
  let journal: string[];
  let processor: ImageProcessorFake;
  let storage: AssetStorageFake;
  let assets: AssetsDaoFake;
  let quota: AssetQuotaHarness;
  let service: AssetsService;

  beforeEach(() => {
    journal = [];
    processor = new ImageProcessorFake(journal);
    storage = new AssetStorageFake(journal);
    assets = new AssetsDaoFake(journal);
    quota = assetQuotaOver(assets, journal);
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
    ]);
    const fetcher = new ImageFetcherFake();
    const io = { storage, processor, fetcher, newId: () => NEW_ID };
    service = new AssetsService({ ...quota.deps, ...io, members, assets });
  });

  function ownerOfVharnOn(plan: 'free' | 'narrador' | 'amigo_do_dono'): void {
    quota.tableOwners.set(VHARN_ID, planAccount({ plan }));
    quota.owners.set(ANA_ID, planAccount({ plan }));
  }

  describe('the side of a map and a background', () => {
    it('on a free table a map is kept at 4096 px and a background at 2048 px', async () => {
      ownerOfVharnOn('free');

      await service.upload(ANA_ID, VHARN_ID, { bytes: PNG, purpose: 'library_map' });
      await service.upload(ANA_ID, VHARN_ID, { bytes: PNG, purpose: 'background' });

      expect(processor.resizes).toEqual([
        { maxSide: 4096, opaqueAsWebp: true },
        { maxSide: 2048, opaqueAsWebp: true },
      ]);
      expect(quota.tableOwners.asked).toEqual([VHARN_ID, VHARN_ID]);
    });

    it('a map imported by link on a free table is also kept at 4096 px', async () => {
      ownerOfVharnOn('free');

      await service.importLink(ANA_ID, VHARN_ID, {
        url: 'https://example.com/mapa.png',
        purpose: 'library_map',
      });

      expect(processor.resizes).toEqual([{ maxSide: 4096, opaqueAsWebp: true }]);
    });

    it('on a narrador table the map keeps up to 8192 px', async () => {
      ownerOfVharnOn('narrador');

      await service.upload(ANA_ID, VHARN_ID, { bytes: PNG, purpose: 'library_map' });

      expect(processor.resizes).toEqual([{ maxSide: 8192, opaqueAsWebp: true }]);
    });

    it('a token on a free table keeps its technical side', async () => {
      ownerOfVharnOn('free');

      await service.upload(BIA_ID, VHARN_ID, { bytes: PNG, purpose: 'token' });

      expect(processor.resizes).toEqual([{ maxSide: 1024, outline: true }]);
    });
  });

  describe('the storage of the owner', () => {
    it('a free owner without room for the kept bytes is refused before the object goes out', async () => {
      ownerOfVharnOn('free');
      quota.usage.set(ANA_ID, FREE_STORAGE - KEPT_BYTES + 1);

      await expect(
        service.upload(ANA_ID, VHARN_ID, { bytes: PNG, purpose: 'token' }),
      ).rejects.toMatchObject({
        code: 'PLAN_LIMIT',
        resource: 'storage',
        limit: FREE_STORAGE,
        plan: 'free',
      });
      expect(journal).toEqual(['normalize', 'keep:begin']);
      expect(storage.objects.size).toBe(0);
      expect(assets.rows).toEqual([]);
    });

    it('the bytes that exactly fill the free storage are kept, inside the transaction', async () => {
      ownerOfVharnOn('free');
      quota.usage.set(ANA_ID, FREE_STORAGE - KEPT_BYTES);

      await service.upload(ANA_ID, VHARN_ID, { bytes: PNG, purpose: 'token' });

      expect(journal).toEqual(['normalize', 'keep:begin', 'put', 'insert', 'keep:end']);
    });

    it("a player's upload counts against the table owner's storage, after the 24 h grace cutoff", async () => {
      ownerOfVharnOn('free');

      await service.upload(BIA_ID, VHARN_ID, { bytes: PNG, purpose: 'token' });

      const cutoff = new Date(QUOTA_NOW.getTime() - 24 * 60 * 60 * 1000);
      expect(quota.usage.asked).toEqual([{ ownerId: ANA_ID, cutoff }]);
      expect(quota.owners.asked).toEqual([ANA_ID]);
      expect(quota.campaigns.writes).toEqual([`lock:${VHARN_ID}`]);
    });

    it("the plan read under the owner's lock decides, not the unlocked one", async () => {
      quota.tableOwners.set(VHARN_ID, planAccount({ plan: 'amigo_do_dono' }));
      quota.owners.set(ANA_ID, planAccount({ plan: 'free' }));
      quota.usage.set(ANA_ID, FREE_STORAGE);

      await expect(
        service.upload(ANA_ID, VHARN_ID, { bytes: PNG, purpose: 'token' }),
      ).rejects.toMatchObject({ code: 'PLAN_LIMIT', resource: 'storage' });
    });

    it('an amigo_do_dono owner with 5 GB stored keeps sending', async () => {
      ownerOfVharnOn('amigo_do_dono');
      quota.usage.set(ANA_ID, 5 * GIB);

      const asset = await service.upload(ANA_ID, VHARN_ID, { bytes: PNG, purpose: 'token' });

      expect(asset.id).toBe(NEW_ID);
    });

    it('a sheet template font also counts against the storage', async () => {
      ownerOfVharnOn('free');
      quota.usage.set(ANA_ID, FREE_STORAGE - WOFF2.byteLength + 1);

      await expect(
        service.uploadSheetTemplateAsset(ANA_ID, VHARN_ID, {
          bytes: WOFF2,
          mimeType: 'font/woff2',
        }),
      ).rejects.toMatchObject({ code: 'PLAN_LIMIT', resource: 'storage' });
      expect(storage.objects.size).toBe(0);
    });

    it('a table gone before the lock answers CAMPAIGN_NOT_FOUND and keeps nothing', async () => {
      quota.campaigns.rows.splice(0, quota.campaigns.rows.length);

      await expect(
        service.upload(ANA_ID, VHARN_ID, { bytes: PNG, purpose: 'token' }),
      ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
      expect(storage.objects.size).toBe(0);
    });
  });
});
