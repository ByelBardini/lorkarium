import { describe, expect, it } from 'vitest';
import { loadSheetAssetData } from '@/features/sheets/use-sheet-asset-data';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';

const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32]).buffer;

async function apiWithFont(): Promise<Readonly<{ api: SheetTemplatesApiFake; id: string }>> {
  const api = new SheetTemplatesApiFake();
  const sent = await api.uploadAsset('vharn', WOFF2, 'font/woff2');
  if (!sent.ok) throw new Error('the fake refused the font');
  return { api, id: sent.value.id };
}

describe('loadSheetAssetData', () => {
  it('reads each declared asset into base64 data by its path', async () => {
    const { api, id } = await apiWithFont();

    const load = await loadSheetAssetData(api, [{ path: 'fontes/x.woff2', assetId: id }]);

    expect(load).toEqual({
      status: 'ready',
      assets: new Map([['fontes/x.woff2', { type: 'font/woff2', base64: 'd09GMg==' }]]),
    });
  });

  it('reads an id once, even named by two paths and asked again', async () => {
    const { api, id } = await apiWithFont();
    const declared = [
      { path: 'a.woff2', assetId: id },
      { path: 'b.woff2', assetId: id },
    ];

    await loadSheetAssetData(api, declared);
    await loadSheetAssetData(api, declared);

    expect(api.assetReads).toEqual([id]);
  });

  it('an asset that cannot be read fails naming its path, and is asked again next time', async () => {
    const api = new SheetTemplatesApiFake();
    const missing = '00000000-0000-4000-8000-0000000000ff';

    const load = await loadSheetAssetData(api, [{ path: 'img/sumiu.png', assetId: missing }]);
    await loadSheetAssetData(api, [{ path: 'img/sumiu.png', assetId: missing }]);

    expect(load).toEqual({ status: 'failed', path: 'img/sumiu.png' });
    expect(api.assetReads).toEqual([missing, missing]);
  });

  it('nothing declared is ready with no assets, and no reader fails the first path', async () => {
    expect(await loadSheetAssetData(undefined, [])).toEqual({ status: 'ready', assets: new Map() });
    const declared = [{ path: 'a.png', assetId: '00000000-0000-4000-8000-000000000001' }];
    expect(await loadSheetAssetData(undefined, declared)).toEqual({
      status: 'failed',
      path: 'a.png',
    });
  });
});
