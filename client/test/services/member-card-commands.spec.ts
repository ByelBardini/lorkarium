import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeMemberCardCommands } from '@/services/member-card-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { BIA_AT_TABLE, VHARN_GRID } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const BIA = BIA_AT_TABLE.userId;

describe('RealtimeMemberCardCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeMemberCardCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeMemberCardCommands(new BoardCommandSender(transport, () => ACTION_ID));
  });

  it('updateMemberCard sends member:updateCard with the member and the changes, no userId', async () => {
    const result = commands.updateMemberCard(VHARN_GRID, BIA, { armorClass: 15 });

    expect(transport.sent).toEqual([
      {
        event: 'member:updateCard',
        payload: {
          actionId: ACTION_ID,
          ...VHARN_GRID,
          memberId: BIA,
          changes: { armorClass: 15 },
        },
      },
    ]);
    await transport.answerAck({ ok: true, version: 9 }, 'member:updateCard');
    expect(await result).toEqual({ ok: true, version: 9 });
  });

  it.each([
    ['FORBIDDEN', 'forbidden'],
    ['MEMBER_NOT_FOUND', 'member_not_found'],
  ])('a refusal with %s is %s', async (code, failure) => {
    const result = commands.updateMemberCard(VHARN_GRID, BIA, { noteOne: 'x' });
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'member:updateCard');
    expect(await result).toEqual({ ok: false, failure });
  });

  it('member:updateCard without an ack in 5 s is offline', async () => {
    const result = commands.updateMemberCard(VHARN_GRID, BIA, { armorClass: null });
    await transport.timeOutAck('member:updateCard');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });
});
