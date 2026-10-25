import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeConditionCatalogCommands } from '@/services/condition-catalog-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { VHARN_GRID, conditionDefinition } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';

describe('RealtimeConditionCatalogCommands', () => {
  const poisoned = conditionDefinition();
  const edit = {
    conditionId: poisoned.id,
    name: 'Nauseado',
    tone: 'harm',
    icon: 'skull',
    color: null,
    look: null,
    description: 'Desvantagem em ataques.',
    maxStacks: null,
    imageAssetId: null,
  } as const;
  let transport: RealtimeTransportFake;
  let commands: RealtimeConditionCatalogCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeConditionCatalogCommands(
      new BoardCommandSender(transport, () => ACTION_ID),
    );
  });

  it.each([
    [
      'condition:updateDefinition',
      () => commands.updateConditionDefinition(VHARN_GRID, edit),
      { ...edit },
    ],
    [
      'condition:deleteDefinition',
      () => commands.deleteConditionDefinition(VHARN_GRID, poisoned.id),
      { conditionId: poisoned.id },
    ],
    ['condition:restoreDefaults', () => commands.restoreDefaultConditions(VHARN_GRID), {}],
    [
      'condition:usage',
      () => commands.conditionUsage(VHARN_GRID, poisoned.id),
      { conditionId: poisoned.id },
    ],
  ] as const)('%s goes out with the envelope and its fields', (event, sendIt, fields) => {
    void sendIt();
    expect(transport.sent).toEqual([
      { event, payload: { actionId: ACTION_ID, ...VHARN_GRID, ...fields } },
    ]);
  });

  it('condition:updateDefinition carries the image the master chose', () => {
    const imageAssetId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    void commands.updateConditionDefinition(VHARN_GRID, { ...edit, imageAssetId });
    expect(transport.sent[0]?.payload).toMatchObject({ imageAssetId });
  });

  it('an ok ack of condition:updateDefinition answers ok with the new version', async () => {
    const result = commands.updateConditionDefinition(VHARN_GRID, edit);
    await transport.answerAck({ ok: true, version: 9 }, 'condition:updateDefinition');
    expect(await result).toEqual({ ok: true, version: 9 });
  });

  it('condition:updateDefinition refused with CONDITION_NAME_TAKEN is the name_taken failure', async () => {
    const result = commands.updateConditionDefinition(VHARN_GRID, edit);
    const error = { code: 'CONDITION_NAME_TAKEN', message: 'x' };
    await transport.answerAck({ ok: false, error }, 'condition:updateDefinition');
    expect(await result).toEqual({ ok: false, failure: 'name_taken' });
  });

  it('condition:usage answered with a count is ok with that many tokens', async () => {
    const result = commands.conditionUsage(VHARN_GRID, poisoned.id);
    await transport.answerAck({ ok: true, tokens: 3 }, 'condition:usage');
    expect(await result).toEqual({ ok: true, tokens: 3 });
  });

  it('condition:usage refused with FORBIDDEN is the forbidden failure', async () => {
    const result = commands.conditionUsage(VHARN_GRID, poisoned.id);
    const error = { code: 'FORBIDDEN', message: 'x' };
    await transport.answerAck({ ok: false, error }, 'condition:usage');
    expect(await result).toEqual({ ok: false, failure: 'forbidden' });
  });

  it('condition:usage without an ack is offline', async () => {
    const result = commands.conditionUsage(VHARN_GRID, poisoned.id);
    await transport.timeOutAck('condition:usage');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });

  it('condition:usage answered with a negative count is unexpected', async () => {
    const result = commands.conditionUsage(VHARN_GRID, poisoned.id);
    await transport.answerAck({ ok: true, tokens: -1 }, 'condition:usage');
    expect(await result).toEqual({ ok: false, failure: 'unexpected' });
  });
});
