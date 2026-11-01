import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeTokenLinkCommands } from '@/services/token-link-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { LYRA_CHARACTER_ID } from '../support/character-fixtures';
import { KAEL_ID, LYRA_ID, VHARN_GRID } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const DAVI_ID = 'd4a7e1b2-3c5f-4e6a-8b9c-0d1e2f3a4b5c';
const CENTER = { col: 10, row: 6 };

describe('RealtimeTokenLinkCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeTokenLinkCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeTokenLinkCommands(new BoardCommandSender(transport, () => ACTION_ID));
  });

  it('linkTokenToCharacter sends token:linkToCharacter with the token and the character', async () => {
    const result = commands.linkTokenToCharacter(VHARN_GRID, KAEL_ID, LYRA_CHARACTER_ID);
    expect(transport.sent).toEqual([
      {
        event: 'token:linkToCharacter',
        payload: {
          actionId: ACTION_ID,
          ...VHARN_GRID,
          tokenId: KAEL_ID,
          characterId: LYRA_CHARACTER_ID,
        },
      },
    ]);
    await transport.answerAck({ ok: true, version: 9 }, 'token:linkToCharacter');
    expect(await result).toEqual({ ok: true, version: 9 });
  });

  it.each([
    ['CHARACTER_ALREADY_PLACED', 'character_already_placed'],
    ['CHARACTER_NOT_FOUND', 'character_not_found'],
  ])('linking refused with %s is %s', async (code, failure) => {
    const result = commands.linkTokenToCharacter(VHARN_GRID, KAEL_ID, LYRA_CHARACTER_ID);
    const refusal = { ok: false, error: { code, message: 'x' } };
    await transport.answerAck(refusal, 'token:linkToCharacter');
    expect(await result).toEqual({ ok: false, failure });
  });

  it('unlinkTokenFromCharacter sends token:unlinkFromCharacter; TOKEN_NOT_LINKED is token_not_linked', async () => {
    const result = commands.unlinkTokenFromCharacter(VHARN_GRID, KAEL_ID);
    expect(transport.sent.at(-1)).toEqual({
      event: 'token:unlinkFromCharacter',
      payload: { actionId: ACTION_ID, ...VHARN_GRID, tokenId: KAEL_ID },
    });
    const refusal = { ok: false, error: { code: 'TOKEN_NOT_LINKED', message: 'x' } };
    await transport.answerAck(refusal, 'token:unlinkFromCharacter');
    expect(await result).toEqual({ ok: false, failure: 'token_not_linked' });
  });

  it('addPlayers sends the center and answers the tokens created and the players skipped', async () => {
    const result = commands.addPlayers(VHARN_GRID, CENTER);
    expect(transport.sent.at(-1)).toEqual({
      event: 'token:addPlayers',
      payload: { actionId: ACTION_ID, ...VHARN_GRID, center: CENTER },
    });
    const ack = { ok: true, version: 8, createdIds: [LYRA_ID], skippedMemberIds: [DAVI_ID] };
    await transport.answerAck(ack, 'token:addPlayers');
    expect(await result).toEqual(ack);
  });

  it('addPlayers refused with NO_FREE_CELLS is no_free_cells; an ack outside the DTO is unexpected', async () => {
    const full = commands.addPlayers(VHARN_GRID, CENTER);
    const refusal = { ok: false, error: { code: 'NO_FREE_CELLS', message: 'x' } };
    await transport.answerAck(refusal, 'token:addPlayers');
    expect(await full).toEqual({ ok: false, failure: 'no_free_cells' });
    const odd = commands.addPlayers(VHARN_GRID, CENTER);
    await transport.answerAck({ ok: true, version: 8 }, 'token:addPlayers');
    expect(await odd).toEqual({ ok: false, failure: 'unexpected' });
  });

  it('addPlayers without an ack in 5 s is offline', async () => {
    const result = commands.addPlayers(VHARN_GRID, CENTER);
    await transport.timeOutAck('token:addPlayers');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });
});
