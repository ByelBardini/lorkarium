import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeTokenVisibilityCommands } from '@/services/token-visibility-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { KAEL_ID, LYRA_ID, VHARN_GRID } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';

describe('RealtimeTokenVisibilityCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeTokenVisibilityCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeTokenVisibilityCommands(
      new BoardCommandSender(transport, () => ACTION_ID),
    );
  });

  it('setTokensHidden sends token:setHiddenMany with the ids and hidden, and answers the version', async () => {
    const result = commands.setTokensHidden(VHARN_GRID, [LYRA_ID, KAEL_ID], true);

    expect(transport.sent).toEqual([
      {
        event: 'token:setHiddenMany',
        payload: { actionId: ACTION_ID, ...VHARN_GRID, tokenIds: [LYRA_ID, KAEL_ID], hidden: true },
      },
    ]);
    await transport.answerAck({ ok: true, version: 9 }, 'token:setHiddenMany');
    expect(await result).toEqual({ ok: true, version: 9 });
  });

  it.each([
    ['FORBIDDEN', 'forbidden'],
    ['TOKEN_NOT_FOUND', 'token_not_found'],
  ])('a refusal with %s is %s', async (code, failure) => {
    const result = commands.setTokensHidden(VHARN_GRID, [LYRA_ID], false);
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'token:setHiddenMany');
    expect(await result).toEqual({ ok: false, failure });
  });

  it('token:setHiddenMany without an ack in 5 s is offline', async () => {
    const result = commands.setTokensHidden(VHARN_GRID, [LYRA_ID], true);
    await transport.timeOutAck('token:setHiddenMany');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });
});
