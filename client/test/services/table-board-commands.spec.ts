import { beforeEach, describe, expect, it } from 'vitest';
import { RealtimeTableBoardCommands, type TokenEdit } from '@/services/table-board-commands';
import { VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const GRID = {
  widthCells: 30,
  heightCells: 20,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 15,
};

describe('RealtimeTableBoardCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeTableBoardCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeTableBoardCommands(transport, () => ACTION_ID);
  });

  it('configureScene sends scene:configure with the action id, the table and the grid', () => {
    void commands.configureScene(VHARN.id, GRID);
    expect(transport.sent).toEqual([
      {
        event: 'scene:configure',
        payload: { actionId: ACTION_ID, campaignId: VHARN.id, ...GRID },
      },
    ]);
  });

  it('an ok ack answers ok with the new version', async () => {
    const result = commands.configureScene(VHARN.id, GRID);
    await transport.answerAck({ ok: true, version: 5 }, 'scene:configure');
    expect(await result).toEqual({ ok: true, version: 5 });
  });

  it.each([
    ['FORBIDDEN', 'forbidden'],
    ['CAMPAIGN_NOT_FOUND', 'not_found'],
    ['INVALID_BODY', 'invalid'],
    ['RATE_LIMITED', 'rate_limited'],
    ['UNAUTHENTICATED', 'unauthenticated'],
    ['WHATEVER', 'unexpected'],
  ])('a refusal with %s is the %s failure', async (code, failure) => {
    const result = commands.configureScene(VHARN.id, GRID);
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'scene:configure');
    expect(await result).toEqual({ ok: false, failure });
  });

  it('an ack that never arrives is offline', async () => {
    const result = commands.configureScene(VHARN.id, GRID);
    await transport.timeOutAck('scene:configure');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });

  it('an ack outside the DTO is unexpected', async () => {
    const result = commands.configureScene(VHARN.id, GRID);
    await transport.answerAck({ ok: true }, 'scene:configure');
    expect(await result).toEqual({ ok: false, failure: 'unexpected' });
  });

  describe('token commands', () => {
    const LYRA = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
    const PV = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

    it.each([
      [
        'token:move',
        () => commands.moveToken(VHARN.id, LYRA, { col: 8, row: 6 }),
        { tokenId: LYRA, col: 8, row: 6 },
      ],
      [
        'token:drag',
        () => commands.dragToken(VHARN.id, LYRA, { col: 5, row: 4 }),
        { tokenId: LYRA, cell: { col: 5, row: 4 } },
      ],
      ['token:drag', () => commands.dragToken(VHARN.id, LYRA, null), { tokenId: LYRA, cell: null }],
      [
        'token:adjustBar',
        () => commands.adjustBar(VHARN.id, LYRA, PV, { op: 'add', amount: -7 }),
        { tokenId: LYRA, barId: PV, change: { op: 'add', amount: -7 } },
      ],
      ['token:delete', () => commands.deleteToken(VHARN.id, LYRA), { tokenId: LYRA }],
    ] as const)(
      '%s goes out with the action id, the table and its fields',
      (event, send, fields) => {
        void send();
        expect(transport.sent).toEqual([
          { event, payload: { actionId: ACTION_ID, campaignId: VHARN.id, ...fields } },
        ]);
      },
    );

    it('createToken and updateToken send the whole token', () => {
      const token: TokenEdit = {
        name: 'Lyra',
        initials: 'LY',
        side: 'ally',
        size: 1,
        controllerIds: [],
        bars: [],
      };
      void commands.createToken(VHARN.id, { ...token, col: 1, row: 2 });
      void commands.updateToken(VHARN.id, LYRA, token);
      expect(transport.sent.map(({ event }) => event)).toEqual(['token:create', 'token:update']);
      expect(transport.sent[1]?.payload).toMatchObject({ tokenId: LYRA, name: 'Lyra' });
    });

    it.each([
      ['OUT_OF_SCENE', 'out_of_scene'],
      ['TOKEN_NOT_FOUND', 'token_not_found'],
      ['BAR_NOT_FOUND', 'token_not_found'],
      ['INVALID_CONTROLLER', 'invalid'],
    ])('a token refusal with %s is %s', async (code, failure) => {
      const result = commands.moveToken(VHARN.id, LYRA, { col: 1, row: 1 });
      await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'token:move');
      expect(await result).toEqual({ ok: false, failure });
    });
  });

  describe('combat and condition commands', () => {
    const KAEL = 'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c';

    it.each([
      ['combat:nextTurn', () => commands.nextTurn(VHARN.id, KAEL), { fromCombatantId: KAEL }],
      [
        'combat:previousTurn',
        () => commands.previousTurn(VHARN.id, KAEL),
        { fromCombatantId: KAEL },
      ],
      [
        'combat:setInitiative',
        () => commands.setInitiative(VHARN.id, KAEL, null),
        { combatantId: KAEL, initiative: null },
      ],
      [
        'combat:moveInTie',
        () => commands.moveInTie(VHARN.id, KAEL, 'up'),
        { combatantId: KAEL, direction: 'up' },
      ],
      ['combat:start', () => commands.startCombat(VHARN.id, [KAEL]), { tokenIds: [KAEL] }],
      ['combat:end', () => commands.endCombat(VHARN.id), {}],
      [
        'condition:define',
        () => commands.defineCondition(VHARN.id, 'Sangrando', 'harm'),
        { name: 'Sangrando', tone: 'harm' },
      ],
      [
        'condition:apply',
        () => commands.applyCondition(VHARN.id, KAEL, KAEL, 2),
        { tokenId: KAEL, conditionId: KAEL, rounds: 2 },
      ],
    ] as const)('%s goes out with its fields', (event, sendIt, fields) => {
      void sendIt();
      expect(transport.sent).toEqual([
        { event, payload: { actionId: ACTION_ID, campaignId: VHARN.id, ...fields } },
      ]);
    });

    it.each([
      ['TURN_ALREADY_CHANGED', 'turn_changed'],
      ['COMBAT_ALREADY_ACTIVE', 'combat_active'],
      ['COMBAT_NOT_ACTIVE', 'combat_inactive'],
      ['CONDITION_NOT_FOUND', 'token_not_found'],
    ])('a refusal with %s is %s', async (code, failure) => {
      const result = commands.nextTurn(VHARN.id, KAEL);
      await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'combat:nextTurn');
      expect(await result).toEqual({ ok: false, failure });
    });
  });
});
