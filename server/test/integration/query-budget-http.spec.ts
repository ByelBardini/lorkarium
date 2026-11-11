import {
  assetResponseDto,
  campaignLibraryDto,
  libraryImageDto,
  sceneFolderDto,
  sheetTemplateAssetResponseDto,
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  type CampaignLibraryDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SheetAssetsDao } from '../../src/modules/sheets/sheet-assets.dao';
import { pngOf } from '../support/images';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

// The ceiling of statements each hot HTTP read sends, counted after the reader's first request
// (docs/context/server/desempenho.md): one more query in a DAO or a policy turns its `it` red.
const BUDGET = {
  libraryImagePlayer: 7,
  libraryImageMaster: 5,
  libraryImageRefused: 10,
  libraryPlayer: 13,
  libraryMaster: 14,
  sheetImage: 11,
  templateAsset: 11,
} as const;

const READS_SHEET_VALUES = /"values"[\s\S]*from "token_sheets"/;
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

  async function libraryImage(folderId: string | null = null, name = 'Retrato'): Promise<string> {
    const assetId = await uploaded();
    const payload = { name, assetId, folderId, visibility: 'public' };
    const url = `/api/campaigns/${live.vharn.id}/library-images`;
    const response = await live.http(live.ana, { method: 'POST', url, payload });
    expect(response.statusCode, response.body).toBe(201);
    return libraryImageDto.parse(response.json()).asset.id;
  }

  async function privateFolder(): Promise<string> {
    return folder('Segredos', 'private', null);
  }

  async function folder(
    name: string,
    visibility: 'public' | 'private',
    parentId: string | null,
  ): Promise<string> {
    const url = `/api/campaigns/${live.vharn.id}/scene-folders`;
    const payload = { name, visibility, parentId };
    const response = await live.http(live.ana, { method: 'POST', url, payload });
    expect(response.statusCode, response.body).toBe(201);
    return sceneFolderDto.parse(response.json()).id;
  }

  async function read(user: SignedInUser, assetId: string): Promise<number> {
    const response = await live.http(user, { method: 'GET', url: `/api/assets/${assetId}` });
    return response.statusCode;
  }

  async function sheetsIn(folderId: string | null, count: number): Promise<void> {
    const templates = `/api/campaigns/${live.vharn.id}/sheet-templates`;
    const code = { files: [{ path: 'index.html', content: '<p></p>' }] };
    const made = await live.http(live.ana, { method: 'POST', url: templates, payload: code });
    const templateId = sheetTemplateResponseDto.parse(made.json()).template.id;
    for (let index = 0; index < count; index += 1) {
      const payload = {
        actionId: crypto.randomUUID(),
        templateId,
        name: `Goblin ${index}`,
        folderId,
      };
      const url = `/api/campaigns/${live.vharn.id}/sheets`;
      const response = await live.http(live.ana, { method: 'POST', url, payload });
      expect(response.statusCode, response.body).toBe(201);
    }
  }

  async function libraryOf(user: SignedInUser): Promise<CampaignLibraryDto> {
    const url = `/api/campaigns/${live.vharn.id}/library`;
    const response = await live.http(user, { method: 'GET', url });
    expect(response.statusCode, response.body).toBe(200);
    return campaignLibraryDto.parse(response.json());
  }

  // Ato (public) > Segredos (private) > Cofre (public): what sits in Cofre is hidden too.
  async function threeLevels(): Promise<void> {
    const ato = await folder('Ato', 'public', null);
    const segredos = await folder('Segredos', 'private', ato);
    const cofre = await folder('Cofre', 'public', segredos);
    await libraryImage(ato, 'Mapa do ato');
    await libraryImage(cofre, 'Tesouro');
    await sheetsIn(ato, 3);
    await sheetsIn(cofre, 2);
    await libraryOf(live.bia);
    await libraryOf(live.ana);
  }

  // Three other images first: a policy that lists the library to find one would read them all.
  async function shelfWith(folderId: string | null = null): Promise<string> {
    for (let index = 0; index < 3; index += 1) await libraryImage();
    const wanted = await libraryImage(folderId);
    await read(live.bia, wanted);
    await read(live.ana, wanted);
    return wanted;
  }

  describe('GET /campaigns/:id/library', () => {
    it(`a player reads it in at most ${BUDGET.libraryPlayer}, hiding what a private folder above hides`, async () => {
      await threeLevels();

      let library: CampaignLibraryDto | undefined;
      const queries = await counted(async () => (library = await libraryOf(live.bia)));

      expect(library?.images.map(({ name }) => name)).toEqual(['Mapa do ato']);
      expect(library?.folders.map(({ name }) => name)).toEqual(['Ato']);
      expect(queries).toBeLessThanOrEqual(BUDGET.libraryPlayer);
    });

    it(`the master reads every item in at most ${BUDGET.libraryMaster}, without the sheet values nor a recursive query per item`, async () => {
      await threeLevels();

      let library: CampaignLibraryDto | undefined;
      const queries = await counted(async () => (library = await libraryOf(live.ana)));

      expect(library?.images).toHaveLength(2);
      expect(library?.sheets).toHaveLength(5);
      expect(queries).toBeLessThanOrEqual(BUDGET.libraryMaster);
      expect(live.queries.matching(READS_SHEET_VALUES)).toBe(0);
      // Only the grids keep theirs: the folder edits and the scene watch read it from the row.
      expect(live.queries.matching(/with recursive/)).toBe(1);
    });
  });

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

  describe('GET /assets/:id of a sheet_image and a sheet_template_asset', () => {
    const sheetsUrl = (): string => `/api/campaigns/${live.vharn.id}/sheets`;
    const WOFF2 = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x10]);

    async function template(manifest?: object): Promise<string> {
      const url = `/api/campaigns/${live.vharn.id}/sheet-templates`;
      const payload = { files: [{ path: 'index.html', content: '<p></p>' }], manifest };
      const response = await live.http(live.ana, { method: 'POST', url, payload });
      expect(response.statusCode, response.body).toBe(201);
      return sheetTemplateResponseDto.parse(response.json()).template.id;
    }

    // Lyra's sheets, read only by Bia (and the masters): Caio reads none of them.
    async function lyraSheets(templateId: string, count: number): Promise<string[]> {
      const ids: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const holder = { memberId: live.bia.id };
        const payload = {
          actionId: crypto.randomUUID(),
          templateId,
          name: `Lyra ${index}`,
          holder,
        };
        const response = await live.http(live.ana, { method: 'POST', url: sheetsUrl(), payload });
        expect(response.statusCode, response.body).toBe(201);
        ids.push(sheetWriteResponseDto.parse(response.json()).sheet.id);
      }
      return ids;
    }

    async function imageOnSheets(count: number): Promise<string> {
      const [first, ...others] = await lyraSheets(await template(), count);
      const response = await live.http(live.ana, {
        method: 'POST',
        url: `${sheetsUrl()}/${first}/images`,
        headers: { 'content-type': 'image/png' },
        payload: await pngOf(40, 40),
      });
      expect(response.statusCode, response.body).toBe(201);
      const assetId = assetResponseDto.parse(response.json()).asset.id;
      const ties = new SheetAssetsDao(live.connection.db);
      for (const sheetId of others) await ties.associate(live.vharn.id, sheetId, assetId);
      return assetId;
    }

    async function fontOnSheets(count: number): Promise<string> {
      const url = `/api/campaigns/${live.vharn.id}/sheet-template-assets`;
      const headers = { 'content-type': 'font/woff2' };
      const sent = await live.http(live.ana, { method: 'POST', url, headers, payload: WOFF2 });
      expect(sent.statusCode, sent.body).toBe(201);
      const assetId = sheetTemplateAssetResponseDto.parse(sent.json()).asset.id;
      const manifest = { assets: [{ path: 'fontes/cormorant.woff2', assetId }] };
      await lyraSheets(await template(manifest), count);
      return assetId;
    }

    async function refusedToCaio(assetId: string): Promise<number> {
      await read(live.caio, assetId);
      let status = 0;
      const queries = await counted(async () => (status = await read(live.caio, assetId)));
      expect(status).toBe(404);
      return queries;
    }

    it(`a sheet_image costs at most ${BUDGET.sheetImage} with 1 sheet or 10 using it`, async () => {
      const one = await refusedToCaio(await imageOnSheets(1));
      const ten = await refusedToCaio(await imageOnSheets(10));

      expect(ten).toBe(one);
      expect(ten).toBeLessThanOrEqual(BUDGET.sheetImage);
    });

    it(`a sheet_template_asset costs at most ${BUDGET.templateAsset} with 1 sheet or 10 using it`, async () => {
      const one = await refusedToCaio(await fontOnSheets(1));
      const ten = await refusedToCaio(await fontOnSheets(10));

      expect(ten).toBe(one);
      expect(ten).toBeLessThanOrEqual(BUDGET.templateAsset);
    });

    it('the player who reads one of the sheets reads the image', async () => {
      const assetId = await imageOnSheets(3);

      expect(await read(live.bia, assetId)).toBe(200);
    });

    it('a sheet_image of another table answers 404 to someone outside it', async () => {
      const assetId = await imageOnSheets(1);
      const outsider = await live.signUp('Duda');

      expect(await read(outsider, assetId)).toBe(404);
    });
  });
});
