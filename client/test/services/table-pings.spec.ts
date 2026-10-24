import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimePingCommands } from '@/services/table-pings';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { VHARN_GRID } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';

describe('RealtimePingCommands', () => {
  let transport: RealtimeTransportFake;
  let pings: RealtimePingCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    pings = new RealtimePingCommands(new BoardCommandSender(transport, () => ACTION_ID));
  });

  it('sendPing emits board:ping with the grid of the tab and the point, and an ok ack is ok', async () => {
    const result = pings.sendPing(VHARN_GRID, { x: 5.5, y: 2.2 });

    expect(transport.sent).toEqual([
      { event: 'board:ping', payload: { actionId: ACTION_ID, ...VHARN_GRID, x: 5.5, y: 2.2 } },
    ]);
    await transport.answerAck({ ok: true }, 'board:ping');
    expect(await result).toEqual({ ok: true });
  });

  it.each([
    ['RATE_LIMITED', 'rate_limited'],
    ['SCENE_NOT_FOUND', 'scene_not_found'],
  ])('a refusal with %s is %s, never a throw', async (code, failure) => {
    const result = pings.sendPing(VHARN_GRID, { x: 1, y: 1 });

    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'board:ping');

    expect(await result).toEqual({ ok: false, failure });
  });

  it('an ack outside the DTO is unexpected', async () => {
    const result = pings.sendPing(VHARN_GRID, { x: 1, y: 1 });

    await transport.answerAck({ ok: true, version: 3 }, 'board:ping');

    expect(await result).toEqual({ ok: false, failure: 'unexpected' });
  });

  it('no ack in time is offline', async () => {
    const result = pings.sendPing(VHARN_GRID, { x: 1, y: 1 });

    await transport.timeOutAck('board:ping');

    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });
});
