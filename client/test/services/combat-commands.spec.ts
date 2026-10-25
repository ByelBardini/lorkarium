import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeCombatCommands } from '@/services/combat-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { VHARN_GRID } from '../support/table-session-fixtures';

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
    ['combat:nextTurn', () => commands.nextTurn(VHARN_GRID, KAEL), { fromCombatantId: KAEL }],
    [
      'combat:previousTurn',
      () => commands.previousTurn(VHARN_GRID, KAEL),
      { fromCombatantId: KAEL },
    ],
    [
      'combat:setInitiative',
      () => commands.setInitiative(VHARN_GRID, KAEL, null),
      { combatantId: KAEL, initiative: null },
    ],
    [
      'combat:moveInTie',
      () => commands.moveInTie(VHARN_GRID, KAEL, 'up'),
      { combatantId: KAEL, direction: 'up' },
    ],
    [
      'combat:start',
      () => commands.startCombat(VHARN_GRID, [{ name: null, tokenIds: [KAEL], initiative: null }]),
      { entries: [{ name: null, tokenIds: [KAEL], initiative: null }] },
    ],
    ['combat:end', () => commands.endCombat(VHARN_GRID), {}],
    [
      'combat:addCombatants',
      () => commands.addCombatants(VHARN_GRID, [{ name: 'Covil', tokenIds: [], initiative: null }]),
      { entries: [{ name: 'Covil', tokenIds: [], initiative: null }] },
    ],
    [
      'combat:regroupTokens',
      () => commands.regroupTokens(VHARN_GRID, [LOBO], { kind: 'own' }),
      { tokenIds: [LOBO], target: { kind: 'own' } },
    ],
    [
      'combat:regroupTokens',
      () => commands.regroupTokens(VHARN_GRID, [LOBO], { kind: 'entry', combatantId: KAEL }),
      { tokenIds: [LOBO], target: { kind: 'entry', combatantId: KAEL } },
    ],
    [
      'combat:renameCombatant',
      () => commands.renameCombatant(VHARN_GRID, KAEL, 'Goblins'),
      { combatantId: KAEL, name: 'Goblins' },
    ],
    [
      'condition:define',
      () =>
        commands.defineCondition(VHARN_GRID, {
          name: 'Inconsciente',
          tone: 'incapacitating',
          icon: 'moon',
          look: 'unconscious',
        }),
      { name: 'Inconsciente', tone: 'incapacitating', icon: 'moon', look: 'unconscious' },
    ],
    [
      'condition:apply',
      () => commands.applyCondition(VHARN_GRID, KAEL, KAEL, 2),
      { tokenId: KAEL, conditionId: KAEL, rounds: 2 },
    ],
    [
      'condition:applyMany',
      () => commands.applyConditions(VHARN_GRID, [KAEL], KAEL, 0),
      { tokenIds: [KAEL], conditionId: KAEL, rounds: 0 },
    ],
    [
      'condition:setRounds',
      () => commands.setConditionRounds(VHARN_GRID, KAEL, LOBO, 3),
      { tokenId: KAEL, activeConditionId: LOBO, rounds: 3 },
    ],
    [
      'condition:setStacks',
      () => commands.setConditionStacks(VHARN_GRID, KAEL, LOBO, 3),
      { tokenId: KAEL, activeConditionId: LOBO, stacks: 3 },
    ],
    [
      'condition:deleteDefinition',
      () => commands.deleteConditionDefinition(VHARN_GRID, KAEL),
      { conditionId: KAEL },
    ],
    ['condition:restoreDefaults', () => commands.restoreDefaultConditions(VHARN_GRID), {}],
    ['condition:usage', () => commands.conditionUsage(VHARN_GRID, KAEL), { conditionId: KAEL }],
    [
      'condition:updateDefinition',
      () =>
        commands.updateConditionDefinition(VHARN_GRID, {
          conditionId: KAEL,
          name: 'Nauseado',
          tone: 'harm',
          icon: 'skull',
          color: null,
          look: null,
          description: 'Desvantagem.',
          maxStacks: null,
          imageAssetId: null,
        }),
      {
        conditionId: KAEL,
        name: 'Nauseado',
        tone: 'harm',
        icon: 'skull',
        color: null,
        look: null,
        description: 'Desvantagem.',
        maxStacks: null,
        imageAssetId: null,
      },
    ],
  ] as const)('%s goes out with its fields', (event, sendIt, fields) => {
    void sendIt();
    expect(transport.sent).toEqual([
      { event, payload: { actionId: ACTION_ID, ...VHARN_GRID, ...fields } },
    ]);
  });

  describe('condition:define and the image', () => {
    const IMAGE_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    const base = { name: 'Cego', tone: 'harm', icon: 'eye-off', look: null } as const;

    it('a condition created without an image leaves the field out (the contract makes it null)', () => {
      void commands.defineCondition(VHARN_GRID, base);
      expect(transport.sent[0]?.payload).not.toHaveProperty('imageAssetId');
    });

    it('a condition created with an image sends its asset id', () => {
      void commands.defineCondition(VHARN_GRID, { ...base, imageAssetId: IMAGE_ID });
      expect(transport.sent[0]?.payload).toMatchObject({ imageAssetId: IMAGE_ID });
    });
  });

  it.each([
    ['TURN_ALREADY_CHANGED', 'turn_changed'],
    ['COMBAT_ALREADY_ACTIVE', 'combat_active'],
    ['COMBAT_NOT_ACTIVE', 'combat_inactive'],
    ['CONDITION_NOT_FOUND', 'token_not_found'],
    ['COMBATANT_NOT_FOUND', 'token_not_found'],
  ])('a refusal with %s is %s', async (code, failure) => {
    const result = commands.nextTurn(VHARN_GRID, KAEL);
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'combat:nextTurn');
    expect(await result).toEqual({ ok: false, failure });
  });

  it.each([
    ['FORBIDDEN', 'forbidden'],
    ['CONDITION_NOT_FOUND', 'token_not_found'],
  ])('condition:setRounds refused with %s is %s', async (code, failure) => {
    const result = commands.setConditionRounds(VHARN_GRID, KAEL, LOBO, 2);
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'condition:setRounds');
    expect(await result).toEqual({ ok: false, failure });
  });

  it('condition:setRounds without an ack is offline', async () => {
    const result = commands.setConditionRounds(VHARN_GRID, KAEL, LOBO, 2);
    await transport.timeOutAck('condition:setRounds');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });

  it('condition:setStacks refused with INVALID_STACKS is invalid_stacks', async () => {
    const result = commands.setConditionStacks(VHARN_GRID, KAEL, LOBO, 6);
    const error = { code: 'INVALID_STACKS', message: 'x' };
    await transport.answerAck({ ok: false, error }, 'condition:setStacks');
    expect(await result).toEqual({ ok: false, failure: 'invalid_stacks' });
  });
});
