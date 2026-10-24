import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeEffectAreaCommands } from '@/services/effect-area-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { VHARN_GRID } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CONE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const CONE = { kind: 'diagonal_cone', x: 6, y: 6, reach: 3, facing: 45, color: 'ember' } as const;
const GROWN = { ...CONE, reach: 4 };

describe('RealtimeEffectAreaCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeEffectAreaCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeEffectAreaCommands(new BoardCommandSender(transport, () => ACTION_ID));
  });

  function sentPayload(): unknown {
    return transport.sent[0]?.payload;
  }

  it('createEffectAreas sends effectArea:createMany and answers the new ids', async () => {
    const result = commands.createEffectAreas(VHARN_GRID, [CONE]);
    expect(transport.sent).toEqual([
      {
        event: 'effectArea:createMany',
        payload: { actionId: ACTION_ID, ...VHARN_GRID, effectAreas: [CONE] },
      },
    ]);
    await transport.answerAck(
      { ok: true, version: 3, createdIds: [CONE_ID] },
      'effectArea:createMany',
    );
    expect(await result).toEqual({ ok: true, version: 3, createdIds: [CONE_ID] });
  });

  it('a reshape without expect sends no expect field at all', () => {
    void commands.reshapeEffectAreas(VHARN_GRID, [{ effectAreaId: CONE_ID, shape: GROWN }]);
    expect(sentPayload()).toEqual({
      actionId: ACTION_ID,
      ...VHARN_GRID,
      reshapes: [{ effectAreaId: CONE_ID, shape: GROWN }],
    });
  });

  it('a reshape of an undo carries the shape the area must still have', () => {
    void commands.reshapeEffectAreas(VHARN_GRID, [
      { effectAreaId: CONE_ID, shape: CONE, expect: GROWN },
    ]);
    expect(sentPayload()).toMatchObject({
      reshapes: [{ effectAreaId: CONE_ID, shape: CONE, expect: GROWN }],
    });
  });

  it('deleteEffectAreas with expect sends each id with the shape it must still have', () => {
    void commands.deleteEffectAreas(
      VHARN_GRID,
      [CONE_ID],
      [{ effectAreaId: CONE_ID, shape: CONE }],
    );
    expect(transport.sent[0]).toEqual({
      event: 'effectArea:deleteMany',
      payload: {
        actionId: ACTION_ID,
        ...VHARN_GRID,
        effectAreaIds: [CONE_ID],
        expect: [{ effectAreaId: CONE_ID, shape: CONE }],
      },
    });
  });

  it('a delete with no precondition sends no expect at all', () => {
    void commands.deleteEffectAreas(VHARN_GRID, [CONE_ID]);
    expect(sentPayload()).toEqual({
      actionId: ACTION_ID,
      ...VHARN_GRID,
      effectAreaIds: [CONE_ID],
    });
  });

  it.each([
    ['EFFECT_AREA_NOT_FOUND', 'effect_area_not_found'],
    ['EFFECT_AREA_LIMIT', 'effect_area_limit'],
  ])('a refusal with %s is the %s failure', async (code, failure) => {
    const result = commands.createEffectAreas(VHARN_GRID, [CONE]);
    await transport.answerAck(
      { ok: false, error: { code, message: 'x' } },
      'effectArea:createMany',
    );
    expect(await result).toEqual({ ok: false, failure });
  });
});
