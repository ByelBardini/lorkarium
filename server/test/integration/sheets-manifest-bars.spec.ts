import { setAccountPlan } from '../support/account-plans';
import {
  characterChangedEventDto,
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  tokenUpdatedDto,
  type SheetWriteResponseDto,
} from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { eventPayload, send, silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { characterOfUser, giveBars } from '../support/table-characters';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
// Before the plans: the owners of Vharn and Quelm on amigo_do_dono (test accounts are born free).
beforeEach(async () => {
  await setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono');
  await setAccountPlan(live.connection.db, live.caio.id, 'amigo_do_dono');
});
const CODE = { files: [{ path: 'index.html', content: '<p></p>' }] };
const MANIFEST_BARS = [
  { label: 'HP', color: 'ember', max: 20 },
  { label: 'MP', color: 'steel', max: 10 },
  { label: 'EF', color: 'moss', max: 8 },
  { label: 'ES', color: 'gold', max: 6 },
];

function masterOf(table: Table): SignedInUser {
  return table.id === live.vharn.id ? live.ana : live.caio;
}

async function templateOf(table: Table = live.vharn): Promise<string> {
  const url = `/api/campaigns/${table.id}/sheet-templates`;
  const manifest = { permissions: [], bars: MANIFEST_BARS };
  const payload = { name: 'Ficha de Lork', ...CODE, manifest };
  const response = await live.http(masterOf(table), { method: 'POST', url, payload });
  if (response.statusCode !== 201) throw new Error(`template answered ${response.body}`);
  return sheetTemplateResponseDto.parse(response.json()).template.id;
}

async function created(holder: object | null, table: Table = live.vharn) {
  const templateId = await templateOf(table);
  const owner = holder ? { holder } : {};
  const payload = { actionId: crypto.randomUUID(), templateId, name: 'Lork', ...owner };
  const url = `/api/campaigns/${table.id}/sheets`;
  const response = await live.http(masterOf(table), { method: 'POST', url, payload });
  if (response.statusCode !== 201) throw new Error(`create answered ${response.body}`);
  return sheetWriteResponseDto.parse(response.json());
}

function give(sheetId: string, holder: object | null, table: Table = live.vharn) {
  const payload = { actionId: crypto.randomUUID(), holder };
  const url = `/api/campaigns/${table.id}/sheets/${sheetId}`;
  return live.http(live.ana, { method: 'PATCH', url, payload });
}

async function given(sheetId: string, holder: object | null): Promise<SheetWriteResponseDto> {
  const response = await give(sheetId, holder);
  if (response.statusCode !== 200) throw new Error(`give answered ${response.body}`);
  return sheetWriteResponseDto.parse(response.json());
}

async function lyraBars() {
  const { bars } = await characterOfUser(live, live.vharn, live.bia);
  return bars.map(({ label, current, max }) => ({ label, current, max }));
}

// Bia's character holds HP 7/20, as if wounded.
async function woundedLyra(): Promise<string> {
  const { character } = await characterOfUser(live, live.vharn, live.bia);
  const hp = { label: 'HP', current: 7, max: 20, color: 'ember', visibility: 'everyone' } as const;
  await giveBars(live, character.id, [hp]);
  return character.id;
}

describe('the manifest bars, added when a sheet is given', () => {
  it('giving the sheet to Bia adds MP, EF and ES to her character, keeps HP at 7 and tells the table', async () => {
    await woundedLyra();
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));

    const { receipt } = await created({ memberId: live.bia.id });

    expect(receipt.skippedBars).toEqual([]);
    expect(await lyraBars()).toEqual([
      { label: 'HP', current: 7, max: 20 },
      { label: 'MP', current: 10, max: 10 },
      { label: 'EF', current: 8, max: 8 },
      { label: 'ES', current: 6, max: 6 },
    ]);
    const change = characterChangedEventDto.parse(await eventPayload(caio, 'character:changed'));
    const [lyra] = change.characters;
    expect(lyra?.bars.map(({ label }) => label)).toEqual(['HP', 'MP', 'EF', 'ES']);
  });

  it('taking the sheet away keeps the bars, and giving it again adds none twice', async () => {
    await woundedLyra();
    const { sheet } = await created({ memberId: live.bia.id });

    await given(sheet.id, null);
    expect(await lyraBars()).toHaveLength(4);
    const again = await given(sheet.id, { memberId: live.bia.id });

    expect(again.receipt.skippedBars).toEqual([]);
    expect((await lyraBars()).map(({ label }) => label)).toEqual(['HP', 'MP', 'EF', 'ES']);
  });

  it('a character already at 8 bars gets none: the receipt lists the four', async () => {
    const { character } = await characterOfUser(live, live.vharn, live.bia);
    const eight = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((label) => ({
      ...{ label, current: 1, max: 1, color: 'ash' as const, visibility: 'everyone' as const },
    }));
    await giveBars(live, character.id, eight);

    const { receipt } = await created({ memberId: live.bia.id });

    expect(receipt.skippedBars).toEqual(['HP', 'MP', 'EF', 'ES']);
    expect((await lyraBars()).map(({ label }) => label)).toEqual(eight.map(({ label }) => label));
  });

  it('a loose token given the sheet gets the bars on its grid: Caio, its controller, hears token:updated', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const caio = await live.atTable(live.caio, live.vharn);
    const anaEvents = recordEventsOf(ana);
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.caio.id, { bars: [] }));
    const bram = await createdTokenOf(anaEvents);
    await silence();
    const caioEvents = recordEventsOf(caio);

    await created({ tokenId: bram.id });

    const updated = tokenUpdatedDto.parse(await eventPayload(caioEvents, 'token:updated'));
    expect(updated.token.id).toBe(bram.id);
    expect(updated.token.bars.map(({ label, current }) => [label, current])).toEqual([
      ['HP', 20],
      ['MP', 10],
      ['EF', 8],
      ['ES', 6],
    ]);
  });

  it('a sheet of Quelm given to Bia through Vharn is 404 and no bar of Vharn moves', async () => {
    await woundedLyra();
    await live.atTable(live.caio, live.quelm);
    const quelmSheet = (await created(null, live.quelm)).sheet.id;
    const biaEvents = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const response = await give(quelmSheet, { memberId: live.bia.id });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'SHEET_NOT_FOUND' });
    expect(await lyraBars()).toEqual([{ label: 'HP', current: 7, max: 20 }]);
    await silence();
    expect(biaEvents.events.map(({ name }) => name)).not.toContain('character:changed');
  });
});
