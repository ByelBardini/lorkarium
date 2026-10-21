import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeCombatCommands } from '@/services/combat-commands';
import { VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';

describe('RealtimeCombatCommands', () => {
  const KAEL = 'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c';
  const LOBO = 'd2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d';
  let transport: RealtimeTransportFake;
  let commands: RealtimeCombatCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeCombatCommands(new BoardCommandSender(transport, () => ACTION_ID));
  });

  it.each([
    ['combat:nextTurn', () => commands.nextTurn(VHARN.id, KAEL), { fromCombatantId: KAEL }],
    ['combat:previousTurn', () => commands.previousTurn(VHARN.id, KAEL), { fromCombatantId: KAEL }],
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
    [
      'combat:start',
      () => commands.startCombat(VHARN.id, [{ name: null, tokenIds: [KAEL], initiative: null }]),
      { entries: [{ name: null, tokenIds: [KAEL], initiative: null }] },
    ],
    ['combat:end', () => commands.endCombat(VHARN.id), {}],
    [
      'combat:addCombatants',
      () => commands.addCombatants(VHARN.id, [{ name: 'Covil', tokenIds: [], initiative: null }]),
      { entries: [{ name: 'Covil', tokenIds: [], initiative: null }] },
    ],
    [
      'combat:regroupTokens',
      () => commands.regroupTokens(VHARN.id, [LOBO], { kind: 'own' }),
      { tokenIds: [LOBO], target: { kind: 'own' } },
    ],
    [
      'combat:regroupTokens',
      () => commands.regroupTokens(VHARN.id, [LOBO], { kind: 'entry', combatantId: KAEL }),
      { tokenIds: [LOBO], target: { kind: 'entry', combatantId: KAEL } },
    ],
    [
      'combat:renameCombatant',
      () => commands.renameCombatant(VHARN.id, KAEL, 'Goblins'),
      { combatantId: KAEL, name: 'Goblins' },
    ],
    [
      'condition:define',
      () =>
        commands.defineCondition(VHARN.id, { name: 'Sangrando', tone: 'harm', icon: 'droplet' }),
      { name: 'Sangrando', tone: 'harm', icon: 'droplet' },
    ],
    [
      'condition:apply',
      () => commands.applyCondition(VHARN.id, KAEL, KAEL, 2),
      { tokenId: KAEL, conditionId: KAEL, rounds: 2 },
    ],
    [
      'condition:applyMany',
      () => commands.applyConditions(VHARN.id, [KAEL], KAEL, 0),
      { tokenIds: [KAEL], conditionId: KAEL, rounds: 0 },
    ],
    [
      'condition:setRounds',
      () => commands.setConditionRounds(VHARN.id, KAEL, LOBO, 3),
      { tokenId: KAEL, activeConditionId: LOBO, rounds: 3 },
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
    ['COMBATANT_NOT_FOUND', 'token_not_found'],
  ])('a refusal with %s is %s', async (code, failure) => {
    const result = commands.nextTurn(VHARN.id, KAEL);
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'combat:nextTurn');
    expect(await result).toEqual({ ok: false, failure });
  });

  it.each([
    ['FORBIDDEN', 'forbidden'],
    ['CONDITION_NOT_FOUND', 'token_not_found'],
  ])('condition:setRounds refused with %s is %s', async (code, failure) => {
    const result = commands.setConditionRounds(VHARN.id, KAEL, LOBO, 2);
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'condition:setRounds');
    expect(await result).toEqual({ ok: false, failure });
  });

  it('condition:setRounds without an ack is offline', async () => {
    const result = commands.setConditionRounds(VHARN.id, KAEL, LOBO, 2);
    await transport.timeOutAck('condition:setRounds');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });
});
