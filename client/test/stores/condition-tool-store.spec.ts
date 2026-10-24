import { describe, expect, it } from 'vitest';
import { conditionChoiceOf, createConditionToolStore } from '@/stores/condition-tool-store';

const POISONED_ID = 'd5e6f7a8-b9c0-4d1e-8f3a-4b5c6d7e8f90';

describe('createConditionToolStore', () => {
  it('starts with no condition picked and no rounds typed', () => {
    expect(conditionChoiceOf(createConditionToolStore().getState())).toEqual({
      conditionId: null,
      roundsText: '',
    });
  });

  it('keeps the picked condition and the rounds as typed, a wrong text included', () => {
    const store = createConditionToolStore();

    store.getState().pick(POISONED_ID);
    store.getState().setRoundsText('2,5');

    expect(conditionChoiceOf(store.getState())).toEqual({
      conditionId: POISONED_ID,
      roundsText: '2,5',
    });
  });

  it('picking null unpicks the condition and keeps the rounds', () => {
    const store = createConditionToolStore();
    store.getState().pick(POISONED_ID);
    store.getState().setRoundsText('3');

    store.getState().pick(null);

    expect(conditionChoiceOf(store.getState())).toEqual({ conditionId: null, roundsText: '3' });
  });
});

describe('conditionChoiceOf', () => {
  it('gives only the choice, without the setters', () => {
    const choice = conditionChoiceOf(createConditionToolStore().getState());
    expect(Object.keys(choice).sort()).toEqual(['conditionId', 'roundsText']);
  });
});
