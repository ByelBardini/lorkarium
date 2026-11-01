import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeCharacterCommands } from '@/services/character-commands';
import { LYRA_CHARACTER_ID } from '../support/character-fixtures';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { LYRA_PV_ID, VHARN_GRID } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const SHEET_ID = '7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d';
const TABLE = { actionId: ACTION_ID, campaignId: VHARN_GRID.campaignId };

describe('RealtimeCharacterCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeCharacterCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeCharacterCommands(new BoardCommandSender(transport, () => ACTION_ID));
  });

  it('updateCharacter sends character:update with the character and the changes, no grid nor userId', async () => {
    const result = commands.updateCharacter(VHARN_GRID, LYRA_CHARACTER_ID, { armorClass: 15 });
    expect(transport.sent).toEqual([
      {
        event: 'character:update',
        payload: { ...TABLE, characterId: LYRA_CHARACTER_ID, changes: { armorClass: 15 } },
      },
    ]);
    await transport.answerAck({ ok: true, version: 4 }, 'character:update');
    expect(await result).toEqual({ ok: true, version: 4 });
  });

  it('adjustCharacterBar sends character:adjustBar with the bar and the change', () => {
    const change = { op: 'add', amount: -7 } as const;
    void commands.adjustCharacterBar(VHARN_GRID, LYRA_CHARACTER_ID, LYRA_PV_ID, change);
    expect(transport.sent.at(-1)).toEqual({
      event: 'character:adjustBar',
      payload: { ...TABLE, characterId: LYRA_CHARACTER_ID, barId: LYRA_PV_ID, change },
    });
  });

  it('setMainSheet sends character:setMainSheet with the sheet', () => {
    void commands.setMainSheet(VHARN_GRID, LYRA_CHARACTER_ID, SHEET_ID);
    expect(transport.sent.at(-1)).toEqual({
      event: 'character:setMainSheet',
      payload: { ...TABLE, characterId: LYRA_CHARACTER_ID, sheetId: SHEET_ID },
    });
  });

  it.each([
    ['FORBIDDEN', 'forbidden'],
    ['CHARACTER_NOT_FOUND', 'character_not_found'],
    ['SHEET_NOT_FOUND', 'sheet_not_found'],
  ])('a refusal with %s is %s', async (code, failure) => {
    const result = commands.setMainSheet(VHARN_GRID, LYRA_CHARACTER_ID, SHEET_ID);
    const refusal = { ok: false, error: { code, message: 'x' } };
    await transport.answerAck(refusal, 'character:setMainSheet');
    expect(await result).toEqual({ ok: false, failure });
  });

  it('a character command without an ack in 5 s is offline', async () => {
    const result = commands.updateCharacter(VHARN_GRID, LYRA_CHARACTER_ID, { noteOne: null });
    await transport.timeOutAck('character:update');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });
});
