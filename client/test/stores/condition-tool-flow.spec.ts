import type { BoardStateDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import {
  missingConditionNotice,
  pickedDefinitionOf,
  stampCondition,
  type ConditionStampTarget,
} from '@/stores/condition-tool-flow';
import type { ConditionToolChoice } from '@/stores/condition-tool-store';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import {
  KAEL_ID,
  VHARN_GRID,
  activeCondition,
  conditionDefinition,
  kael,
  vharnBoard,
} from '../support/table-session-fixtures';

const poisoned = conditionDefinition();
const POISONED_TWO_ROUNDS: ConditionToolChoice = { conditionId: poisoned.id, roundsText: '2' };
const ON_KAEL: ConditionStampTarget = { tokenId: KAEL_ID, removes: false };
const OFF_KAEL: ConditionStampTarget = { tokenId: KAEL_ID, removes: true };

describe('stampCondition', () => {
  let commands: TableBoardCommandsFake;
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
  });

  function boardWith(kaelConditions = [activeCondition({ remainingRounds: 1 })]): BoardStateDto {
    return vharnBoard({
      tokens: [kael({ conditions: kaelConditions })],
      conditionDefinitions: [poisoned],
    });
  }

  function stamp(
    target: ConditionStampTarget,
    choice: ConditionToolChoice = POISONED_TWO_ROUNDS,
    board: BoardStateDto | null = boardWith([]),
  ): Promise<void> {
    return stampCondition(target, { board, choice, interaction: interaction.getState() });
  }

  it('a click applies the picked condition for the rounds typed', async () => {
    await stamp(ON_KAEL);

    expect(commands.sentAs('applyCondition')).toEqual([
      {
        name: 'applyCondition',
        ...VHARN_GRID,
        fields: { tokenId: KAEL_ID, conditionId: poisoned.id, rounds: 2 },
      },
    ]);
  });

  it('no rounds typed applies it with no limit (0)', async () => {
    await stamp(ON_KAEL, { conditionId: poisoned.id, roundsText: '' });

    expect(commands.sentAs('applyCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, conditionId: poisoned.id, rounds: 0 },
    ]);
  });

  it('a click on a token that already has it sends the same apply, which renews it', async () => {
    await stamp(ON_KAEL, POISONED_TWO_ROUNDS, boardWith());

    expect(commands.sentAs('applyCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, conditionId: poisoned.id, rounds: 2 },
    ]);
  });

  it('Shift + click on a token with it removes its active condition by id', async () => {
    await stamp(OFF_KAEL, POISONED_TWO_ROUNDS, boardWith());

    expect(commands.sentAs('removeCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, activeConditionId: activeCondition().id },
    ]);
    expect(commands.sentAs('applyCondition')).toEqual([]);
  });

  it('Shift + click on a stacking condition with 3 stacks takes one stack off (2 left)', async () => {
    const stacked = activeCondition({ maxStacks: 5, stacks: 3 });

    await stamp(OFF_KAEL, POISONED_TWO_ROUNDS, boardWith([stacked]));

    expect(commands.sentAs('setConditionStacks').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, activeConditionId: stacked.id, stacks: 2 },
    ]);
    expect(commands.sentAs('removeCondition')).toEqual([]);
  });

  it('Shift + click on a stacking condition with its last stack removes it', async () => {
    const lastStack = activeCondition({ maxStacks: 5, stacks: 1 });

    await stamp(OFF_KAEL, POISONED_TWO_ROUNDS, boardWith([lastStack]));

    expect(commands.sentAs('removeCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, activeConditionId: lastStack.id },
    ]);
    expect(commands.sentAs('setConditionStacks')).toEqual([]);
  });

  it('a plain click on a stacking condition the token has sends the apply (the server adds the stack)', async () => {
    const stacked = activeCondition({ maxStacks: 5, stacks: 3 });

    await stamp(ON_KAEL, POISONED_TWO_ROUNDS, boardWith([stacked]));

    expect(commands.sentAs('applyCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, conditionId: poisoned.id, rounds: 2 },
    ]);
    expect(commands.sentAs('setConditionStacks')).toEqual([]);
  });

  it('Shift + click removes even with wrong rounds typed (the rounds are not read)', async () => {
    await stamp(OFF_KAEL, { conditionId: poisoned.id, roundsText: '100' }, boardWith());

    expect(commands.sentAs('removeCondition')).toHaveLength(1);
  });

  it('Shift + click on a token without it sends nothing and says so', async () => {
    await stamp(OFF_KAEL);

    expect(commands.sent).toEqual([]);
    expect(interaction.getState().notice).toBe('Kael não tem Envenenado.');
  });

  it('with no condition picked nothing goes out and the line asks for one', async () => {
    await stamp(ON_KAEL, { conditionId: null, roundsText: '2' });

    expect(commands.sent).toEqual([]);
    expect(interaction.getState().notice).toBe('Escolha uma condição.');
  });

  it('a pick no longer on the table list counts as none picked', async () => {
    const deleted = vharnBoard({ tokens: [kael()], conditionDefinitions: [] });

    await stamp(ON_KAEL, POISONED_TWO_ROUNDS, deleted);

    expect(commands.sent).toEqual([]);
    expect(interaction.getState().notice).toBe('Escolha uma condição.');
  });

  it.each(['100', '-1', '2,5', 'abc'])(
    'rounds "%s" send nothing and say the range',
    async (roundsText) => {
      await stamp(ON_KAEL, { conditionId: poisoned.id, roundsText });

      expect(commands.sent).toEqual([]);
      expect(interaction.getState().notice).toBe('Rodadas vão de 0 a 99.');
    },
  );

  it('read only, a click sends nothing and says nothing', async () => {
    interaction.getState().setReadOnly(true);

    await stamp(ON_KAEL);

    expect(commands.sent).toEqual([]);
    expect(interaction.getState().notice).toBeNull();
  });

  it('read only, a click with nothing picked says nothing either', async () => {
    interaction.getState().setReadOnly(true);

    await stamp(ON_KAEL, { conditionId: null, roundsText: '' });

    expect(interaction.getState().notice).toBeNull();
  });

  it('before the first snapshot a click sends nothing', async () => {
    await stamp(ON_KAEL, POISONED_TWO_ROUNDS, null);

    expect(commands.sent).toEqual([]);
  });

  it('a token gone from the board gets nothing', async () => {
    await stamp({ tokenId: 'b0b0b0b0-0000-4000-8000-000000000000', removes: false });

    expect(commands.sent).toEqual([]);
  });

  it('a refusal of the server goes to the status line', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });

    await stamp(ON_KAEL);

    expect(interaction.getState().notice).toBe('recusado: forbidden');
  });
});

describe('pickedDefinitionOf', () => {
  it('finds the picked condition on the table list', () => {
    const board = vharnBoard({ conditionDefinitions: [poisoned] });
    expect(pickedDefinitionOf(board, poisoned.id)?.name).toBe('Envenenado');
  });

  it('with nothing picked answers null', () => {
    expect(pickedDefinitionOf(vharnBoard({ conditionDefinitions: [poisoned] }), null)).toBeNull();
  });
});

describe('missingConditionNotice', () => {
  it('names the token and the condition it lacks', () => {
    expect(missingConditionNotice('Lyra', 'Cego')).toBe('Lyra não tem Cego.');
  });
});
