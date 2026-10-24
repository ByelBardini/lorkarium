import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeTokenLinkCommands } from '@/services/token-link-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { BIA_AT_TABLE, KAEL_ID, LYRA_ID, VHARN_GRID } from '../support/table-session-fixtures';

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

  it('linkTokenToCard sends token:linkToCard with the token and the member', async () => {
    const result = commands.linkTokenToCard(VHARN_GRID, LYRA_ID, BIA_AT_TABLE.userId);
    expect(transport.sent).toEqual([
      {
        event: 'token:linkToCard',
        payload: {
          actionId: ACTION_ID,
          ...VHARN_GRID,
          tokenId: LYRA_ID,
          memberId: BIA_AT_TABLE.userId,
        },
      },
    ]);
    await transport.answerAck({ ok: true, version: 9 }, 'token:linkToCard');
    expect(await result).toEqual({ ok: true, version: 9 });
  });

  it.each([
    ['CHARACTER_ALREADY_PLACED', 'character_already_placed'],
    ['MEMBER_NOT_FOUND', 'member_not_found'],
  ])('linking refused with %s is %s', async (code, failure) => {
    const result = commands.linkTokenToCard(VHARN_GRID, LYRA_ID, BIA_AT_TABLE.userId);
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'token:linkToCard');
    expect(await result).toEqual({ ok: false, failure });
  });

  it('unlinkTokenFromCard sends token:unlinkFromCard; TOKEN_NOT_LINKED is token_not_linked', async () => {
    const result = commands.unlinkTokenFromCard(VHARN_GRID, KAEL_ID);
    expect(transport.sent.at(-1)).toEqual({
      event: 'token:unlinkFromCard',
      payload: { actionId: ACTION_ID, ...VHARN_GRID, tokenId: KAEL_ID },
    });
    const refusal = { ok: false, error: { code: 'TOKEN_NOT_LINKED', message: 'x' } };
    await transport.answerAck(refusal, 'token:unlinkFromCard');
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
