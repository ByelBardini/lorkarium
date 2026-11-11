import { assetResponseDto, libraryImageDto, sceneFolderDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { pngOf } from '../support/images';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

// The ceiling of statements each hot HTTP read sends, counted after the reader's first request
// (docs/context/server/desempenho.md): one more query in a DAO or a policy turns its `it` red.
const BUDGET = {
  libraryImagePlayer: 7,
  libraryImageMaster: 5,
  libraryImageRefused: 10,
} as const;

const LISTS_LIBRARY_IMAGES = /from "library_images"(?![\s\S]*"library_images"\."asset_id" = )/;

describe('the queries each hot HTTP read costs', () => {
  const live = useTokenTable();

  async function counted(work: () => Promise<unknown>): Promise<number> {
    live.queries.reset();
    await work();
    return live.queries.count;
  }

  async function uploaded(table = live.vharn, owner = live.ana): Promise<string> {
    const response = await live.http(owner, {
      method: 'POST',
      url: `/api/campaigns/${table.id}/assets?purpose=library_image`,
      headers: { 'content-type': 'image/png' },
      payload: await pngOf(40, 40),
    });
    expect(response.statusCode, response.body).toBe(201);
    return assetResponseDto.parse(response.json()).asset.id;
  }

  async function libraryImage(folderId: string | null = null): Promise<string> {
    const assetId = await uploaded();
    const payload = { name: 'Retrato', assetId, folderId, visibility: 'public' };
    const url = `/api/campaigns/${live.vharn.id}/library-images`;
    const response = await live.http(live.ana, { method: 'POST', url, payload });
    expect(response.statusCode, response.body).toBe(201);
    return libraryImageDto.parse(response.json()).asset.id;
  }

  async function privateFolder(): Promise<string> {
    const url = `/api/campaigns/${live.vharn.id}/scene-folders`;
    const payload = { name: 'Segredos', visibility: 'private' };
    const response = await live.http(live.ana, { method: 'POST', url, payload });
    expect(response.statusCode, response.body).toBe(201);
    return sceneFolderDto.parse(response.json()).id;
  }

  async function read(user: SignedInUser, assetId: string): Promise<number> {
    const response = await live.http(user, { method: 'GET', url: `/api/assets/${assetId}` });
    return response.statusCode;
  }

  // Three other images first: a policy that lists the library to find one would read them all.
  async function shelfWith(folderId: string | null = null): Promise<string> {
    for (let index = 0; index < 3; index += 1) await libraryImage();
    const wanted = await libraryImage(folderId);
    await read(live.bia, wanted);
    await read(live.ana, wanted);
    return wanted;
  }

  describe('GET /assets/:id of a library_image', () => {
    it(`a player reading a public image costs at most ${BUDGET.libraryImagePlayer}, without listing the library`, async () => {
      const assetId = await shelfWith();

      let status = 0;
      const queries = await counted(async () => (status = await read(live.bia, assetId)));

      expect(status).toBe(200);
      expect(queries).toBeLessThanOrEqual(BUDGET.libraryImagePlayer);
      expect(live.queries.matching(LISTS_LIBRARY_IMAGES)).toBe(0);
    });

    it(`the master costs at most ${BUDGET.libraryImageMaster}: no presentation, no image row`, async () => {
      const assetId = await shelfWith();

      let status = 0;
      const queries = await counted(async () => (status = await read(live.ana, assetId)));

      expect(status).toBe(200);
      expect(queries).toBeLessThanOrEqual(BUDGET.libraryImageMaster);
    });

    it(`an image in a private folder answers 404 after asking the documents too, at most ${BUDGET.libraryImageRefused}`, async () => {
      const assetId = await shelfWith(await privateFolder());

      let status = 0;
      const queries = await counted(async () => (status = await read(live.bia, assetId)));

      expect(status).toBe(404);
      expect(queries).toBeLessThanOrEqual(BUDGET.libraryImageRefused);
    });

    it('an image of another table answers 404 to someone outside it', async () => {
      const assetId = await uploaded(live.quelm, live.caio);

      expect(await read(live.bia, assetId)).toBe(404);
    });
  });
});
