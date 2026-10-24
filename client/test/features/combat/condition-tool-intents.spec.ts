import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { routeConditionIntent } from '@/features/combat/condition-tool-intents';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createConditionToolStore, type ConditionToolStore } from '@/stores/condition-tool-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  KAEL_ID,
  VHARN_GRID,
  activeCondition,
  conditionDefinition,
  kael,
  vharnBoard,
} from '../../support/table-session-fixtures';

describe('routeConditionIntent', () => {
  const poisoned = conditionDefinition();
  let commands: TableBoardCommandsFake;
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let conditionTool: StoreApi<ConditionToolStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    board = createBoardStore(VHARN.id, () => {});
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({ tokens: [kael()], conditionDefinitions: [poisoned] }),
    });
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
    conditionTool = createConditionToolStore();
    conditionTool.getState().pick(poisoned.id);
    conditionTool.getState().setRoundsText('3');
  });

  it('the stamp on a token is taken and applies the tool choice', () => {
    const intent = { kind: 'conditionStamped', tokenId: KAEL_ID, removes: false } as const;

    const taken = routeConditionIntent({ board, interaction, conditionTool }, intent);

    expect(taken).toBe(true);
    expect(commands.sentAs('applyCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, conditionId: poisoned.id, rounds: 3 },
    ]);
  });

  it('the stamp reads the choice as it stands when pressed', () => {
    conditionTool.getState().setRoundsText('');
    const intent = { kind: 'conditionStamped', tokenId: KAEL_ID, removes: false } as const;

    routeConditionIntent({ board, interaction, conditionTool }, intent);

    expect(commands.sentAs('applyCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, conditionId: poisoned.id, rounds: 0 },
    ]);
  });

  it('the stamp with Shift takes the condition off the token', () => {
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({
        tokens: [kael({ conditions: [activeCondition()] })],
        conditionDefinitions: [poisoned],
      }),
    });
    const intent = { kind: 'conditionStamped', tokenId: KAEL_ID, removes: true } as const;

    routeConditionIntent({ board, interaction, conditionTool }, intent);

    expect(commands.sentAs('removeCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, activeConditionId: activeCondition().id },
    ]);
  });

  it('the stamp with Shift on a stacking condition takes one stack off the confirmed count', () => {
    const stacked = activeCondition({ maxStacks: 5, stacks: 4 });
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({
        tokens: [kael({ conditions: [stacked] })],
        conditionDefinitions: [conditionDefinition({ maxStacks: 5 })],
      }),
    });
    const intent = { kind: 'conditionStamped', tokenId: KAEL_ID, removes: true } as const;

    routeConditionIntent({ board, interaction, conditionTool }, intent);

    expect(commands.sentAs('setConditionStacks').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, activeConditionId: stacked.id, stacks: 3 },
    ]);
  });

  it('any other intent is not taken and sends nothing', () => {
    const intent = { kind: 'tokenPicked', tokenId: KAEL_ID, additive: false } as const;

    expect(routeConditionIntent({ board, interaction, conditionTool }, intent)).toBe(false);
    expect(commands.sent).toEqual([]);
  });
});
