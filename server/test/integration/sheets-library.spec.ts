import {
  campaignLibraryDto,
  memberCardChangedDto,
  sceneFolderDto,
  sheetResponseDto,
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  tokenCreatedDto,
  type CampaignLibraryDto,
  type SheetDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { castIdOf, gridState, linkToCard, lyraPoisonedAtVharn } from '../support/characters';
import { envelope, eventPayload, send, silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
const CODE = { html: '<p></p>', css: '', js: '' };

function sheetsUrl(table: Table = live.vharn): string {
  return `/api/campaigns/${table.id}/sheets`;
}

async function templateOf(user: SignedInUser = live.ana, table: Table = live.vharn) {
  const url = `/api/campaigns/${table.id}/sheet-templates`;
  const response = await live.http(user, { method: 'POST', url, payload: CODE });
  return sheetTemplateResponseDto.parse(response.json()).template.id;
}

async function folderOf(user: SignedInUser, table: Table, name: string): Promise<string> {
  const url = `/api/campaigns/${table.id}/scene-folders`;
  const response = await live.http(user, { method: 'POST', url, payload: { name } });
  return sceneFolderDto.parse(response.json()).id;
}

function create(extra: object, templateId: string) {
  const payload = { actionId: crypto.randomUUID(), templateId, name: 'Goblin', ...extra };
  return live.http(live.ana, { method: 'POST', url: sheetsUrl(), payload });
}

async function created(extra: object = {}): Promise<SheetDto> {
  const response = await create(extra, await templateOf());
  if (response.statusCode !== 201) throw new Error(`create answered ${response.body}`);
  return sheetWriteResponseDto.parse(response.json()).sheet;
}

function manage(sheetId: string, changes: object, user: SignedInUser = live.ana) {
  const payload = { actionId: crypto.randomUUID(), ...changes };
  return live.http(user, { method: 'PATCH', url: `${sheetsUrl()}/${sheetId}`, payload });
}

function readSheet(user: SignedInUser, sheetId: string) {
  return live.http(user, { method: 'GET', url: `${sheetsUrl()}/${sheetId}` });
}

async function libraryOf(user: SignedInUser): Promise<CampaignLibraryDto> {
  const url = `/api/campaigns/${live.vharn.id}/library`;
  return campaignLibraryDto.parse((await live.http(user, { method: 'GET', url })).json());
}

function sheetNamesOf(library: CampaignLibraryDto): string[] {
  return (library.sheets ?? []).map(({ name }) => name);
}

describe('sheets in the library', () => {
  it('Ana creates the Goblin without a holder: only masters read it and the table hears library:changed', async () => {
    const bia = await live.atTable(live.bia, live.vharn);
    const biaEvents = recordEventsOf(bia);

    const goblin = await created();

    expect(goblin).toMatchObject({
      name: 'Goblin',
      tokenId: null,
      memberId: null,
      canManage: true,
    });
    await eventPayload(biaEvents, 'library:changed');
    expect((await readSheet(live.bia, goblin.id)).statusCode).toBe(404);
    expect(sheetNamesOf(await libraryOf(live.ana))).toEqual(['Goblin']);
    expect(sheetNamesOf(await libraryOf(live.bia))).toEqual([]);
  });

  it('giving a sheet to Caio, who has no character, creates his anchor: the table hears it in the cast', async () => {
    const { ana, recorders } = await lyraPoisonedAtVharn(live);
    const castId = await castIdOf(live, live.ana, live.vharn);
    await silence();
    const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));

    const kael = await created({ name: 'Kael', holder: { memberId: live.caio.id } });

    const anchor = tokenCreatedDto.parse(await eventPayload(recorders[1], 'token:created'));
    expect(anchor).toMatchObject({ sceneId: castId, token: { name: 'Caio', initials: 'CA' } });
    expect(anchor.token).toMatchObject({ side: 'ally', width: 1, height: 1, col: 0, row: 0 });
    const card = memberCardChangedDto.parse(await eventPayload(caioEvents, 'member:cardChanged'));
    expect(card.card).toMatchObject({ userId: live.caio.id, anchorTokenId: anchor.token.id });
    expect(card.version).toBe(anchor.version + 1);
    expect(kael).toMatchObject({ tokenId: anchor.token.id, memberId: live.caio.id });
    const read = sheetResponseDto.parse((await readSheet(live.caio, kael.id)).json());
    expect(read.sheet).toMatchObject({ canEdit: true, canManage: false });
    expect((await gridState(ana, live.vharn, castId)).tokens.map(({ id }) => id)).toContain(
      anchor.token.id,
    );
  });

  it('the anchor takes the character name of the card when Caio wrote one', async () => {
    const caio = await live.atTable(live.caio, live.vharn);
    const changes = { characterName: 'Kael' };
    await send(caio, 'member:updateCard', {
      ...envelope(live.vharn.id),
      memberId: live.caio.id,
      changes,
    });

    const sheet = await created({ holder: { memberId: live.caio.id } });

    const castId = await castIdOf(live, live.ana, live.vharn);
    const anchor = (await gridState(caio, live.vharn, castId)).tokens.find(
      ({ id }) => id === sheet.tokenId,
    );
    expect(anchor).toMatchObject({ name: 'Kael', initials: 'KA' });
  });

  it('giving a sheet to Bia, whose Lyra is her character, hangs it on the anchor and creates nothing', async () => {
    const { ana, lyra, recorders } = await lyraPoisonedAtVharn(live);
    await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
    const castId = await castIdOf(live, live.ana, live.vharn);
    const anchorId = (await gridState(ana, live.vharn, castId)).tokens[0]?.id;
    await silence();
    const before = recorders[2].events.length;

    const sheet = await created({ holder: { memberId: live.bia.id } });

    expect(sheet).toMatchObject({ tokenId: anchorId, memberId: live.bia.id });
    await silence();
    const heard = recorders[2].events.slice(before).map(({ name }) => name);
    expect(heard).not.toContain('token:created');
    expect(heard).not.toContain('member:cardChanged');
  });

  it.each([
    ['the master Ana', () => live.ana.id],
    ['a player of Quelm only', () => crypto.randomUUID()],
  ])('giving a sheet to %s is 404 MEMBER_NOT_FOUND', async (_who, memberOf) => {
    const response = await create({ holder: { memberId: memberOf() } }, await templateOf());

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'MEMBER_NOT_FOUND' });
    expect(sheetNamesOf(await libraryOf(live.ana))).toEqual([]);
  });

  it("the library: Ana gets every sheet, Caio only the table one of Lyra's", async () => {
    const { ana, lyra } = await lyraPoisonedAtVharn(live);
    await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
    const templateId = await templateOf();
    await create({ name: 'Lyra', holder: { tokenId: lyra.id } }, templateId);
    await create({ name: 'Diário', holder: { tokenId: lyra.id }, visibility: 'table' }, templateId);
    await create({ name: 'Goblin' }, templateId);

    const master = await libraryOf(live.ana);
    const caio = await libraryOf(live.caio);
    const bia = await libraryOf(live.bia);

    expect(sheetNamesOf(master)).toEqual(['Lyra', 'Diário', 'Goblin']);
    expect(sheetNamesOf(caio)).toEqual(['Diário']);
    expect(sheetNamesOf(bia)).toEqual(['Lyra', 'Diário']);
    expect(caio.sheets?.[0]).toMatchObject({ memberId: live.bia.id });
    expect(caio.sheets?.[0]).not.toHaveProperty('values');
  });

  it("Ana takes the sheet from Bia: it is nobody's and Bia no longer reads it", async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const sheet = await created({ holder: { tokenId: lyra.id } });

    const response = await manage(sheet.id, { holder: null });

    expect(sheetWriteResponseDto.parse(response.json()).sheet).toMatchObject({
      ...{ tokenId: null, memberId: null, version: 1 },
    });
    expect((await readSheet(live.bia, sheet.id)).statusCode).toBe(404);
  });

  it('Ana moves the sheet to Ato 1; deleting Ato 1 brings it up to the root, values kept', async () => {
    const ato = await folderOf(live.ana, live.vharn, 'Ato 1');
    const sheet = await created();
    const moved = await manage(sheet.id, { folderId: ato, name: 'Goblin chefe' });
    expect(sheetWriteResponseDto.parse(moved.json()).sheet).toMatchObject({ folderId: ato });

    const url = `/api/campaigns/${live.vharn.id}/scene-folders/${ato}`;
    expect((await live.http(live.ana, { method: 'DELETE', url })).statusCode).toBe(204);

    expect((await libraryOf(live.ana)).sheets).toEqual([
      expect.objectContaining({ id: sheet.id, name: 'Goblin chefe', folderId: null, version: 1 }),
    ]);
  });

  it('a folder of Quelm is 404 FOLDER_NOT_FOUND, on create and on move', async () => {
    const quelmFolder = await folderOf(live.caio, live.quelm, 'Covil');
    const templateId = await templateOf();

    const creating = await create({ folderId: quelmFolder }, templateId);
    const sheet = await created();
    const moving = await manage(sheet.id, { folderId: quelmFolder });

    expect([creating.statusCode, moving.statusCode]).toEqual([404, 404]);
    expect(moving.json()).toMatchObject({ code: 'FOLDER_NOT_FOUND' });
  });

  it('Bia renaming, moving or giving a sheet is 403', async () => {
    const { lyra } = await lyraPoisonedAtVharn(live);
    const sheet = await created({ holder: { tokenId: lyra.id } });

    const answers = [
      await manage(sheet.id, { name: 'Minha' }, live.bia),
      await manage(sheet.id, { holder: null }, live.bia),
    ];

    expect(answers.map(({ statusCode }) => statusCode)).toEqual([403, 403]);
  });

  it('the Quelm sheet is not found at Vharn, and Vharn sheets are not in the Quelm library', async () => {
    const caio = await live.atTable(live.caio, live.quelm);
    const quelmEvents = recordEventsOf(caio);
    await send(caio, 'token:create', tokenCommandFor(live.quelm, live.caio.id));
    const quelmToken = (await createdTokenOf(quelmEvents)).id;
    const payload = {
      ...{ actionId: crypto.randomUUID(), templateId: await templateOf(live.caio, live.quelm) },
      ...{ name: 'Covil', holder: { tokenId: quelmToken } },
    };
    const quelm = await live.http(live.caio, {
      method: 'POST',
      url: sheetsUrl(live.quelm),
      payload,
    });
    const quelmSheet = sheetWriteResponseDto.parse(quelm.json()).sheet;
    await created();

    expect((await readSheet(live.ana, quelmSheet.id)).statusCode).toBe(404);
    const url = `/api/campaigns/${live.quelm.id}/library`;
    const quelmLibrary = campaignLibraryDto.parse(
      (await live.http(live.caio, { method: 'GET', url })).json(),
    );
    expect(sheetNamesOf(quelmLibrary)).toEqual(['Covil']);
  });

  it('deleting the sheet tells the library; the template counts every sheet, held or not', async () => {
    const templateId = await templateOf();
    const goblin = sheetWriteResponseDto.parse((await create({}, templateId)).json()).sheet;
    await create({ name: 'Orc' }, templateId);
    const templateUrl = `/api/campaigns/${live.vharn.id}/sheet-templates/${templateId}`;

    const inUse = await live.http(live.ana, { method: 'DELETE', url: templateUrl });
    const payload = { actionId: crypto.randomUUID() };
    const gone = await live.http(live.ana, {
      method: 'DELETE',
      url: `${sheetsUrl()}/${goblin.id}`,
      payload,
    });

    expect(inUse.json()).toMatchObject({
      code: 'SHEET_TEMPLATE_IN_USE',
      message: expect.stringContaining('2 sheets'),
    });
    expect(gone.statusCode).toBe(204);
    expect(sheetNamesOf(await libraryOf(live.ana))).toEqual(['Orc']);
  });
});
