import {
  characterChangedEventDto,
  createSheetBarResponseDto,
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  tokenUpdatedDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { eventPayload, send, silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { characterOfUser, giveBars } from '../support/table-characters';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
const CODE = { files: [{ path: 'index.html', content: '<p></p>' }] };
const FOLEGO = { label: 'Fôlego', max: 6 };

function masterOf(table: Table): SignedInUser {
  return table.id === live.vharn.id ? live.ana : live.caio;
}

async function templateOf(table: Table, permissions: string[]): Promise<string> {
  const url = `/api/campaigns/${table.id}/sheet-templates`;
  const payload = { name: 'Ficha de Lork', ...CODE, manifest: { permissions, bars: [] } };
  const response = await live.http(masterOf(table), { method: 'POST', url, payload });
  if (response.statusCode !== 201) throw new Error(`template answered ${response.body}`);
  return sheetTemplateResponseDto.parse(response.json()).template.id;
}

type SheetSetup = Readonly<{
  holder?: object;
  table?: Table;
  permissions?: string[];
  visibility?: 'controllers' | 'table';
}>;

async function sheetOf(setup: SheetSetup = {}): Promise<string> {
  const table = setup.table ?? live.vharn;
  const templateId = await templateOf(table, setup.permissions ?? ['character:bars']);
  const { holder, visibility } = setup;
  const payload = { actionId: crypto.randomUUID(), templateId, name: 'Lork', holder, visibility };
  const url = `/api/campaigns/${table.id}/sheets`;
  const response = await live.http(masterOf(table), { method: 'POST', url, payload });
  if (response.statusCode !== 201) throw new Error(`create answered ${response.body}`);
  await silence();
  return sheetWriteResponseDto.parse(response.json()).sheet.id;
}

function createBar(user: SignedInUser, sheetId: string, bar: object = FOLEGO) {
  const url = `/api/campaigns/${live.vharn.id}/sheets/${sheetId}/bars`;
  return live.http(user, { method: 'POST', url, payload: { bar } });
}

async function lyraLabels(): Promise<string[]> {
  const { bars } = await characterOfUser(live, live.vharn, live.bia);
  return bars.map(({ label }) => label);
}

describe('POST …/sheets/:sheetId/bars', () => {
  it('Bia creates Fôlego on Lyra through a sheet with character:bars: 201 and character:changed', async () => {
    const sheetId = await sheetOf({ holder: { memberId: live.bia.id } });
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));

    const response = await createBar(live.bia, sheetId);

    expect(response.statusCode).toBe(201);
    const made = createSheetBarResponseDto.parse(response.json());
    expect(made.created).toBe(true);
    const { bars } = await characterOfUser(live, live.vharn, live.bia);
    const folego = bars.find(({ id }) => id === made.barId);
    expect(folego).toMatchObject({ label: 'Fôlego', current: 6, max: 6, color: 'gold' });
    const change = characterChangedEventDto.parse(await eventPayload(caio, 'character:changed'));
    expect(change.characters[0]?.bars.map(({ label }) => label)).toContain('Fôlego');
  });

  it('asking again answers 200 with the same id and created false, and tells nobody', async () => {
    const sheetId = await sheetOf({ holder: { memberId: live.bia.id } });
    const first = createSheetBarResponseDto.parse((await createBar(live.bia, sheetId)).json());
    await silence();
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));

    const response = await createBar(live.bia, sheetId, { label: ' folego ', max: 9 });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ barId: first.barId, created: false });
    expect(await lyraLabels()).toEqual(['Fôlego']);
    await silence();
    expect(caio.events.map(({ name }) => name)).not.toContain('character:changed');
  });

  it('a template without character:bars is 403 PERMISSION_NOT_DECLARED and writes nothing', async () => {
    const sheetId = await sheetOf({
      holder: { memberId: live.bia.id },
      permissions: ['character:stats'],
    });

    const response = await createBar(live.bia, sheetId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'PERMISSION_NOT_DECLARED' });
    expect(response.json().message).toContain('character:bars');
    expect(await lyraLabels()).toEqual([]);
  });

  it('Caio, who only reads the table sheet of Lyra, is 403 FORBIDDEN', async () => {
    const holder = { memberId: live.bia.id };
    const sheetId = await sheetOf({ holder, visibility: 'table' });

    const response = await createBar(live.caio, sheetId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect(await lyraLabels()).toEqual([]);
  });

  it('Lyra with 8 bars is 409 BAR_LIMIT citing the label, and keeps her 8', async () => {
    const { character } = await characterOfUser(live, live.vharn, live.bia);
    const eight = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((label) => ({
      ...{ label, current: 1, max: 1, color: 'ash' as const, visibility: 'everyone' as const },
    }));
    await giveBars(live, character.id, eight);
    const sheetId = await sheetOf({ holder: { memberId: live.bia.id } });

    const response = await createBar(live.bia, sheetId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'BAR_LIMIT' });
    expect(response.json().message).toContain('"Fôlego"');
    expect(await lyraLabels()).toEqual(eight.map(({ label }) => label));
  });

  it('a loose token gets the bar on its grid: Caio, its controller, hears token:updated', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const caio = await live.atTable(live.caio, live.vharn);
    const anaEvents = recordEventsOf(ana);
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.caio.id, { bars: [] }));
    const bram = await createdTokenOf(anaEvents);
    const sheetId = await sheetOf({ holder: { tokenId: bram.id } });
    const caioEvents = recordEventsOf(caio);

    const response = await createBar(live.caio, sheetId);

    expect(response.statusCode).toBe(201);
    const updated = tokenUpdatedDto.parse(await eventPayload(caioEvents, 'token:updated'));
    expect(updated.token.bars.map(({ id, label }) => [id, label])).toEqual([
      [createSheetBarResponseDto.parse(response.json()).barId, 'Fôlego'],
    ]);
  });

  it('a sheet of Quelm asked through Vharn is 404 and no bar of Vharn moves', async () => {
    await live.atTable(live.caio, live.quelm);
    const quelmSheet = await sheetOf({ table: live.quelm });
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const response = await createBar(live.ana, quelmSheet);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'SHEET_NOT_FOUND' });
    expect(await lyraLabels()).toEqual([]);
    await silence();
    expect(biaEvents.events.map(({ name }) => name)).not.toContain('character:changed');
  });
});
