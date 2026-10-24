import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  conditionToolHintOf,
  followConditionTool,
} from '@/features/combat/use-condition-tool-follow';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createConditionToolStore, type ConditionToolStore } from '@/stores/condition-tool-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { eventAt, vharnBoard, VHARN_GRID } from '../../support/table-session-fixtures';

const ENVENENADO: ConditionDefinitionDto = {
  id: 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b',
  name: 'Envenenado',
  tone: 'harm',
  icon: 'skull',
  color: null,
  look: null,
  description: '',
  maxStacks: null,
};

describe('conditionToolHintOf', () => {
  it('without a pick it asks for one in the panel', () => {
    expect(conditionToolHintOf(null, '2')).toBe('Escolha uma condição no painel.');
  });

  it.each([
    ['2', 'Clique num token para aplicar Envenenado (2 rodadas); Shift+clique tira.'],
    ['1', 'Clique num token para aplicar Envenenado (1 rodada); Shift+clique tira.'],
    ['', 'Clique num token para aplicar Envenenado (sem limite); Shift+clique tira.'],
    ['0', 'Clique num token para aplicar Envenenado (sem limite); Shift+clique tira.'],
  ])('rounds "%s" read "%s"', (roundsText, hint) => {
    expect(conditionToolHintOf(ENVENENADO, roundsText)).toBe(hint);
  });

  it('a stacking pick says a click adds 1 stack and Shift+click takes 1 off', () => {
    const stacking = { ...ENVENENADO, maxStacks: 5 };
    expect(conditionToolHintOf(stacking, '2')).toBe(
      'Clique soma 1 stack de Envenenado (2 rodadas); Shift+clique tira 1.',
    );
  });

  it('invalid rounds say the range instead', () => {
    expect(conditionToolHintOf(ENVENENADO, 'abc')).toBe('Rodadas vão de 0 a 99.');
  });
});

describe('followConditionTool', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let conditionTool: StoreApi<ConditionToolStore>;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({ conditionDefinitions: [ENVENENADO] }),
    });
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    conditionTool = createConditionToolStore();
  });

  it('a picked condition deleted from the list is unpicked', () => {
    conditionTool.getState().pick(ENVENENADO.id);
    followConditionTool({ board, interaction, conditionTool });
    board.getState().apply({
      kind: 'boardEvent',
      event: eventAt(5, {
        type: 'conditionDefinitionDeleted',
        payload: { conditionId: ENVENENADO.id },
      }),
    });
    expect(conditionTool.getState().conditionId).toBeNull();
  });

  it('a pick still on the list stays', () => {
    conditionTool.getState().pick(ENVENENADO.id);
    followConditionTool({ board, interaction, conditionTool });
    expect(conditionTool.getState().conditionId).toBe(ENVENENADO.id);
  });

  it('with the tool on, a new pick says itself on the status line', () => {
    interaction.getState().setTool('conditions');
    followConditionTool({ board, interaction, conditionTool });
    conditionTool.getState().pick(ENVENENADO.id);
    expect(interaction.getState().notice).toBe(
      'Clique num token para aplicar Envenenado (sem limite); Shift+clique tira.',
    );
  });

  it('with another tool on, a pick leaves the status line alone', () => {
    interaction.getState().setTool('ruler');
    followConditionTool({ board, interaction, conditionTool });
    conditionTool.getState().pick(ENVENENADO.id);
    expect(interaction.getState().notice).toBe('Arraste para medir.');
  });

  it('a refusal on the line is not replaced when the interaction changes by itself', () => {
    conditionTool.getState().pick(ENVENENADO.id);
    interaction.getState().setTool('conditions');
    followConditionTool({ board, interaction, conditionTool });
    interaction.getState().say('Só o mestre pode fazer isso.');
    interaction.getState().selectMany([], { additive: false });
    expect(interaction.getState().notice).toBe('Só o mestre pode fazer isso.');
  });

  it('stopping it unsubscribes: a deletion no longer unpicks', () => {
    conditionTool.getState().pick(ENVENENADO.id);
    const stop = followConditionTool({ board, interaction, conditionTool });
    stop();
    board.getState().apply({
      kind: 'boardEvent',
      event: eventAt(5, {
        type: 'conditionDefinitionDeleted',
        payload: { conditionId: ENVENENADO.id },
      }),
    });
    expect(conditionTool.getState().conditionId).toBe(ENVENENADO.id);
  });

  it('before the first snapshot the pick is kept: there is no list to judge it by', () => {
    const empty = createBoardStore(VHARN.id, () => undefined);
    conditionTool.getState().pick(ENVENENADO.id);
    followConditionTool({ board: empty, interaction, conditionTool });
    expect(conditionTool.getState().conditionId).toBe(ENVENENADO.id);
  });

  it('with the tool already on, the picked hint shows as soon as the follow starts', () => {
    conditionTool.getState().pick(ENVENENADO.id);
    interaction.getState().setTool('conditions');
    followConditionTool({ board, interaction, conditionTool });
    expect(interaction.getState().notice).toBe(
      'Clique num token para aplicar Envenenado (sem limite); Shift+clique tira.',
    );
  });

  it('changing the rounds of a picked condition replaces its own hint on the line', () => {
    conditionTool.getState().pick(ENVENENADO.id);
    interaction.getState().setTool('conditions');
    followConditionTool({ board, interaction, conditionTool });
    conditionTool.getState().setRoundsText('3');
    expect(interaction.getState().notice).toBe(
      'Clique num token para aplicar Envenenado (3 rodadas); Shift+clique tira.',
    );
  });
});
