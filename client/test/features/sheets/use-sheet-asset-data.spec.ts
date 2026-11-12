import { describe, expect, it } from 'vitest';
import {
  SHEET_ASSET_READS_LIMIT,
  loadSheetAssetData,
} from '@/features/sheets/use-sheet-asset-data';
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

  describe(`the ${SHEET_ASSET_READS_LIMIT} ids kept`, () => {
    async function apiWithFonts(
      count: number,
    ): Promise<Readonly<{ api: SheetTemplatesApiFake; ids: string[] }>> {
      const api = new SheetTemplatesApiFake();
      const ids: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const sent = await api.uploadAsset('vharn', WOFF2, 'font/woff2');
        if (!sent.ok) throw new Error(`the fake refused font ${index}`);
        ids.push(sent.value.id);
      }
      return { api, ids };
    }

    async function readEach(api: SheetTemplatesApiFake, ids: readonly string[]): Promise<void> {
      for (const assetId of ids) await loadSheetAssetData(api, [{ path: 'f.woff2', assetId }]);
    }

    it('one id past the ceiling lets the oldest go: it is read again when asked', async () => {
      const { api, ids } = await apiWithFonts(SHEET_ASSET_READS_LIMIT + 1);
      await readEach(api, ids);

      await readEach(api, [ids[0]!, ids.at(-1)!]);

      expect(api.assetReads).toEqual([...ids, ids[0]]);
    });

    it('an id used again goes back to the end of the line: the next oldest leaves instead', async () => {
      const { api, ids } = await apiWithFonts(SHEET_ASSET_READS_LIMIT + 1);
      const [first, second] = ids;
      await readEach(api, ids.slice(0, -1));
      await readEach(api, [first!, ids.at(-1)!]);

      await readEach(api, [first!, second!]);

      expect(api.assetReads).toEqual([...ids, second]);
    });
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
