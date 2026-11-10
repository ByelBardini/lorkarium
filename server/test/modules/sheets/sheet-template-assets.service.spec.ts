import { describe, expect, it } from 'vitest';
import { SheetTemplateAssetsService } from '../../../src/modules/sheets/sheet-template-assets.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, DUDA_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import { TemplateAssetIngestFake } from '../../support/sheet-template-assets-fakes';
import { SheetTemplatesHarness } from '../../support/sheet-templates-fakes';

function serviceOf(): Readonly<{
  service: SheetTemplateAssetsService;
  ingest: TemplateAssetIngestFake;
}> {
  const ingest = new TemplateAssetIngestFake();
  const { members } = new SheetTemplatesHarness();
  return { service: new SheetTemplateAssetsService({ members, assets: ingest }), ingest };
}

const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1]);

describe('SheetTemplateAssetsService', () => {
  it('Ana, the master, sends a font and the assets keep it with the type she sent', async () => {
    const { service, ingest } = serviceOf();

    const asset = await service.upload(
      { userId: ANA_ID, campaignId: VHARN_ID },
      WOFF2,
      'font/woff2',
    );

    expect(asset).toMatchObject({ mimeType: 'font/woff2', sizeBytes: 6 });
    expect(ingest.sent).toEqual([{ userId: ANA_ID, campaignId: VHARN_ID, mimeType: 'font/woff2' }]);
  });

  it.each([
    ['Bia, a player', BIA_ID],
    ['Duda, a spectator', DUDA_ID],
  ])('%s is FORBIDDEN before anything is kept', async (_who, userId) => {
    const { service, ingest } = serviceOf();
    const requester = { userId, campaignId: VHARN_ID };

    await expect(service.authorizeSender(requester)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.upload(requester, WOFF2, 'font/woff2')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(ingest.sent).toEqual([]);
  });

  it('Ana sending to Quelm, a table she is not at, is CAMPAIGN_NOT_FOUND', async () => {
    const { service } = serviceOf();

    await expect(
      service.authorizeSender({ userId: ANA_ID, campaignId: QUELM_ID }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });
});
