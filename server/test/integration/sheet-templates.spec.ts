import {
  SHEET_TEMPLATE_SOURCE_MAX_BYTES,
  campaignLibraryDto,
  sceneFolderDto,
  sheetTemplateResponseDto,
  type CampaignLibraryDto,
  type SheetTemplateDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const INDEX = { path: 'index.html', content: '<p id="pv"></p>' };
const CODE = { files: [INDEX, { path: 'style.css', content: 'p { color: red; }' }] };
const FIVE_FILES = [
  INDEX,
  { path: 'paginas/perfil.html', content: '<h2>Perfil</h2>' },
  { path: 'estilo.css', content: 'p{}' },
  { path: 'a.js', content: 'lorkarium.ready();' },
  { path: 'b.js', content: '' },
];

function templatesUrl(table: Table = live.vharn): string {
  return `/api/campaigns/${table.id}/sheet-templates`;
}

async function folderOf(user: SignedInUser, table: Table, name: string): Promise<string> {
  const url = `/api/campaigns/${table.id}/scene-folders`;
  const response = await live.http(user, { method: 'POST', url, payload: { name } });
  return sceneFolderDto.parse(response.json()).id;
}

async function created(payload: object, user: SignedInUser = live.ana): Promise<SheetTemplateDto> {
  const response = await live.http(user, { method: 'POST', url: templatesUrl(), payload });
  if (response.statusCode !== 201) throw new Error(`create template answered ${response.body}`);
  return sheetTemplateResponseDto.parse(response.json()).template;
}

async function libraryOf(user: SignedInUser): Promise<CampaignLibraryDto> {
  const url = `/api/campaigns/${live.vharn.id}/library`;
  return campaignLibraryDto.parse((await live.http(user, { method: 'GET', url })).json());
}

function patchTemplate(user: SignedInUser, templateId: string, payload: object) {
  return live.http(user, { method: 'PATCH', url: `${templatesUrl()}/${templateId}`, payload });
}

describe('sheet templates of the library over HTTP', () => {
  it('Ana creates "Ficha Tormenta" in Sistemas, saves five files and her library lists it without code', async () => {
    const sistemas = await folderOf(live.ana, live.vharn, 'Sistemas');
    const tormenta = await created({ name: 'Ficha Tormenta', folderId: sistemas, ...CODE });

    const edit = await patchTemplate(live.ana, tormenta.id, {
      expectedVersion: 0,
      files: FIVE_FILES,
    });

    expect(edit.statusCode).toBe(200);
    expect(sheetTemplateResponseDto.parse(edit.json()).template).toMatchObject({
      version: 1,
      files: FIVE_FILES,
    });
    expect((await libraryOf(live.ana)).sheetTemplates).toEqual([
      expect.objectContaining({ id: tormenta.id, name: 'Ficha Tormenta', folderId: sistemas }),
    ]);
    expect((await libraryOf(live.ana)).sheetTemplates?.[0]).not.toHaveProperty('files');
  });

  it('Ana reads the code back by id, and the answer is not cached', async () => {
    const tormenta = await created({ name: 'Ficha Tormenta', ...CODE });

    const url = `${templatesUrl()}/${tormenta.id}`;
    const response = await live.http(live.ana, { method: 'GET', url });

    expect(sheetTemplateResponseDto.parse(response.json()).template.files).toEqual(CODE.files);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('saving only another order of the same files bumps the version and keeps the new order', async () => {
    const tormenta = await created({ files: FIVE_FILES });
    const reordered = [FIVE_FILES[0], FIVE_FILES[4], FIVE_FILES[3], FIVE_FILES[2], FIVE_FILES[1]];

    await patchTemplate(live.ana, tormenta.id, { expectedVersion: 0, files: reordered });

    const url = `${templatesUrl()}/${tormenta.id}`;
    const read = sheetTemplateResponseDto.parse(
      (await live.http(live.ana, { method: 'GET', url })).json(),
    );
    expect(read.template).toMatchObject({ version: 1, files: reordered });
  });

  it('Caio, master of Quelm, reading the files of a Vharn template from Quelm is 404 without them', async () => {
    const tormenta = await created({ files: FIVE_FILES });

    const url = `${templatesUrl(live.quelm)}/${tormenta.id}`;
    const asked = await live.http(live.caio, { method: 'GET', url });

    expect(asked.statusCode).toBe(404);
    expect(asked.body).not.toContain('Perfil');
  });

  it('a file path that leaves the template is 400 citing it and nothing is saved', async () => {
    const payload = { files: [INDEX, { path: '../fora.js', content: '' }] };

    const response = await live.http(live.ana, { method: 'POST', url: templatesUrl(), payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: expect.stringContaining('"../fora.js"') });
    expect((await libraryOf(live.ana)).sheetTemplates).toEqual([]);
  });

  it('a save over the version another master saved is 409 SHEET_TEMPLATE_VERSION_CONFLICT', async () => {
    const tormenta = await created(CODE);
    await patchTemplate(live.ana, tormenta.id, { expectedVersion: 0, name: 'Primeira' });

    const stale = await patchTemplate(live.ana, tormenta.id, { expectedVersion: 0, name: 'Velha' });

    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'SHEET_TEMPLATE_VERSION_CONFLICT' });
  });

  it('deleting the folder Sistemas takes the template up to the root, code and version kept', async () => {
    const sistemas = await folderOf(live.ana, live.vharn, 'Sistemas');
    const tormenta = await created({ folderId: sistemas, ...CODE });

    const url = `/api/campaigns/${live.vharn.id}/scene-folders/${sistemas}`;
    expect((await live.http(live.ana, { method: 'DELETE', url })).statusCode).toBe(204);

    expect((await libraryOf(live.ana)).sheetTemplates).toEqual([
      expect.objectContaining({ id: tormenta.id, folderId: null, version: 0 }),
    ]);
  });

  it('a template without sheets is deleted with 204 and is gone', async () => {
    const tormenta = await created(CODE);

    const url = `${templatesUrl()}/${tormenta.id}`;
    expect((await live.http(live.ana, { method: 'DELETE', url })).statusCode).toBe(204);

    expect((await live.http(live.ana, { method: 'GET', url })).statusCode).toBe(404);
    expect((await libraryOf(live.ana)).sheetTemplates).toEqual([]);
  });

  it('Bia creating, editing, reading or deleting is 403 and her library has no templates', async () => {
    const tormenta = await created(CODE);
    const url = `${templatesUrl()}/${tormenta.id}`;

    const answers = [
      await live.http(live.bia, { method: 'POST', url: templatesUrl(), payload: CODE }),
      await patchTemplate(live.bia, tormenta.id, { expectedVersion: 0, name: 'Minha' }),
      await live.http(live.bia, { method: 'GET', url }),
      await live.http(live.bia, { method: 'DELETE', url }),
    ];

    expect(answers.map(({ statusCode }) => statusCode)).toEqual([403, 403, 403, 403]);
    expect(await libraryOf(live.bia)).not.toHaveProperty('sheetTemplates');
  });

  it('a folder of Quelm is 404 FOLDER_NOT_FOUND', async () => {
    const quelmFolder = await folderOf(live.caio, live.quelm, 'De Quelm');

    const payload = { folderId: quelmFolder, ...CODE };
    const response = await live.http(live.ana, { method: 'POST', url: templatesUrl(), payload });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'FOLDER_NOT_FOUND' });
  });

  it('the template of Quelm asked by its id at Vharn is 404 and Caio cannot touch it there', async () => {
    const url = templatesUrl(live.quelm);
    const response = await live.http(live.caio, { method: 'POST', url, payload: CODE });
    const quelmTemplate = sheetTemplateResponseDto.parse(response.json()).template;

    const asked = await live.http(live.ana, {
      method: 'GET',
      url: `${templatesUrl()}/${quelmTemplate.id}`,
    });

    expect(asked.statusCode).toBe(404);
    expect(asked.json()).toMatchObject({ code: 'SHEET_TEMPLATE_NOT_FOUND' });
  });

  it('files one byte over 512 KiB in total is 400 and nothing is saved', async () => {
    const html = 'a'.repeat(SHEET_TEMPLATE_SOURCE_MAX_BYTES - 1);
    const payload = {
      files: [
        { path: 'index.html', content: html },
        { path: 'a.js', content: 'cc' },
      ],
    };

    const response = await live.http(live.ana, { method: 'POST', url: templatesUrl(), payload });

    expect(response.statusCode).toBe(400);
    expect((await libraryOf(live.ana)).sheetTemplates).toEqual([]);
  });

  it('Bia hears library:changed after each template change and none after a refusal', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const tormenta = await created(CODE);
    await patchTemplate(live.ana, tormenta.id, { expectedVersion: 0, name: 'Tormenta' });
    await patchTemplate(live.ana, tormenta.id, { expectedVersion: 0, name: 'Recusada' });
    await live.http(live.ana, { method: 'DELETE', url: `${templatesUrl()}/${tormenta.id}` });

    await bia.until(3);
    await silence();
    expect(bia.events.filter(({ name }) => name === 'library:changed')).toHaveLength(3);
  });

  it('the template stays after the server restarts', async () => {
    const tormenta = await created({ name: 'Ficha Tormenta', ...CODE });

    await live.restart();

    const url = `${templatesUrl()}/${tormenta.id}`;
    const response = await live.http(live.ana, { method: 'GET', url });
    expect(sheetTemplateResponseDto.parse(response.json()).template.name).toBe('Ficha Tormenta');
  });
});

describe('the manifest of a sheet template over HTTP', () => {
  const manifest = {
    permissions: ['character:stats', 'character:portrait', 'sheet:images'],
    bars: [{ label: 'HP', color: 'ember', max: 12 }],
  };

  function readTemplate(user: SignedInUser, templateId: string, table: Table = live.vharn) {
    return live.http(user, { method: 'GET', url: `${templatesUrl(table)}/${templateId}` });
  }

  it('Ana creates Ficha de Lork with a manifest and reads it back', async () => {
    const lork = await created({ name: 'Ficha de Lork', ...CODE, manifest });

    const read = sheetTemplateResponseDto.parse((await readTemplate(live.ana, lork.id)).json());

    expect(lork.manifest).toEqual({ ...manifest, assets: [] });
    expect(read.template.manifest).toEqual({ ...manifest, assets: [] });
  });

  it('a template created without a manifest declares nothing', async () => {
    const tormenta = await created(CODE);

    expect(tormenta.manifest).toEqual({ permissions: [], bars: [], assets: [] });
  });

  it('saving only the manifest bumps the version and keeps the code', async () => {
    const tormenta = await created(CODE);

    const saved = await patchTemplate(live.ana, tormenta.id, { expectedVersion: 0, manifest });

    expect(saved.statusCode).toBe(200);
    expect(sheetTemplateResponseDto.parse(saved.json()).template).toMatchObject({
      version: 1,
      manifest,
      files: CODE.files,
    });
  });

  it('Bia, a player, saving a manifest is 403 and it stays empty', async () => {
    const tormenta = await created(CODE);

    const refused = await patchTemplate(live.bia, tormenta.id, { expectedVersion: 0, manifest });

    expect(refused.statusCode).toBe(403);
    const read = sheetTemplateResponseDto.parse((await readTemplate(live.ana, tormenta.id)).json());
    expect(read.template).toMatchObject({ version: 0, manifest: { permissions: [], bars: [] } });
  });

  it('Caio, master of Quelm, asking for the manifest of a Vharn template from Quelm is 404', async () => {
    const lork = await created({ ...CODE, manifest });

    const asked = await readTemplate(live.caio, lork.id, live.quelm);

    expect(asked.statusCode).toBe(404);
    expect(asked.json()).toMatchObject({ code: 'SHEET_TEMPLATE_NOT_FOUND' });
    expect(asked.body).not.toContain('character:stats');
  });

  it('an unknown permission is 400 citing it, on create and on save, and nothing is saved', async () => {
    const tormenta = await created(CODE);
    const network = { permissions: ['network'], bars: [] };

    const create = await live.http(live.ana, {
      method: 'POST',
      url: templatesUrl(),
      payload: { ...CODE, name: 'Com rede', manifest: network },
    });
    const save = await patchTemplate(live.ana, tormenta.id, {
      expectedVersion: 0,
      manifest: network,
    });

    expect([create.statusCode, save.statusCode]).toEqual([400, 400]);
    expect(save.json()).toMatchObject({
      code: 'INVALID_BODY',
      message: expect.stringContaining('permission "network"'),
    });
    expect((await libraryOf(live.ana)).sheetTemplates?.map(({ name }) => name)).toEqual([
      'Modelo sem nome',
    ]);
    const read = sheetTemplateResponseDto.parse((await readTemplate(live.ana, tormenta.id)).json());
    expect(read.template.version).toBe(0);
  });
});
