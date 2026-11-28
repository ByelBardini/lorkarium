import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeRoundCycleCommands, type RoundCycleFields } from '@/services/round-cycle-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { MOON_ID, MOON_PHASE_IDS } from '../support/round-cycle-fixtures';
import { VHARN_GRID } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const LYRA_USER = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';

const fields: RoundCycleFields = {
  name: 'Fases da Lua',
  holder: { kind: 'table' },
  visibility: 'some',
  seerIds: [LYRA_USER],
  chooserIds: [LYRA_USER],
  announce: true,
  phases: [
    { name: 'Lua Nova', icon: 'game-icons:cycle' as const, imageAssetId: null },
    { name: 'Lua Cheia', icon: 'game-icons:cycle' as const, imageAssetId: null },
  ],
};

describe('RealtimeRoundCycleCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeRoundCycleCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeRoundCycleCommands(new BoardCommandSender(transport, () => ACTION_ID));
  });

  const table = { actionId: ACTION_ID, campaignId: VHARN_GRID.campaignId };

  it.each([
    ['cycle:define', () => commands.defineRoundCycle(VHARN_GRID, fields), { ...fields }],
    [
      'cycle:update',
      () => commands.updateRoundCycle(VHARN_GRID, MOON_ID, fields),
      { cycleId: MOON_ID, ...fields },
    ],
    ['cycle:delete', () => commands.deleteRoundCycle(VHARN_GRID, MOON_ID), { cycleId: MOON_ID }],
  ] as const)(
    '%s goes out with the table envelope (no grid) and its fields',
    (event, sendIt, sent) => {
      void sendIt();
      expect(transport.sent).toEqual([{ event, payload: { ...table, ...sent } }]);
    },
  );

  it('cycle:chooseNext names the grid of the combat and the phase', () => {
    void commands.chooseNextPhase(VHARN_GRID, MOON_ID, MOON_PHASE_IDS[2]);
    expect(transport.sent).toEqual([
      {
        event: 'cycle:chooseNext',
        payload: {
          ...table,
          sceneId: VHARN_GRID.sceneId,
          cycleId: MOON_ID,
          phaseId: MOON_PHASE_IDS[2],
        },
      },
    ]);
  });

  it('cycle:chooseNext with null goes back to following the cycle', () => {
    void commands.chooseNextPhase(VHARN_GRID, MOON_ID, null);
    expect(transport.sent[0]?.payload).toMatchObject({ phaseId: null });
  });

  it.each([
    ['ROUND_CYCLE_NOT_ACTIVE', 'cycle_not_active'],
    ['ROUND_CYCLE_LIMIT', 'cycle_limit'],
    ['ROUND_CYCLE_NOT_FOUND', 'cycle_not_found'],
    ['ROUND_CYCLE_PHASE_NOT_FOUND', 'cycle_not_found'],
    ['ROUND_CYCLE_MEMBER_NOT_PLAYER', 'cycle_member_not_player'],
    ['ROUND_CYCLE_HOLDER_NOT_FOUND', 'cycle_holder_not_found'],
  ])('a refusal with %s is the %s failure', async (code, failure) => {
    const result = commands.chooseNextPhase(VHARN_GRID, MOON_ID, null);
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'cycle:chooseNext');
    expect(await result).toEqual({ ok: false, failure });
  });
});
