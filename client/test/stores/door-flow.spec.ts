import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { VHARN } from '../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { CELL_DOOR_ID, cellDoor } from '../support/wall-fixtures';

describe('opening and closing doors', () => {
  let commands: TableBoardCommandsFake;
  let store: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    store = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
  });

  it('a click on a closed door opens it and says "Porta aberta."', async () => {
    await store.getState().toggleDoor(cellDoor());

    expect(commands.sentAs('setDoor').map(({ fields }) => fields)).toEqual([
      { wallId: CELL_DOOR_ID, state: 'open' },
    ]);
    expect(store.getState().notice).toBe('Porta aberta.');
  });

  it('a click on an open door closes it and says "Porta fechada."', async () => {
    await store.getState().toggleDoor(cellDoor({ doorState: 'open' }));

    expect(commands.sentAs('setDoor')[0]?.fields).toEqual({
      wallId: CELL_DOOR_ID,
      state: 'closed',
    });
    expect(store.getState().notice).toBe('Porta fechada.');
  });

  it('a player clicking a locked door hears it is locked, and nothing is sent', async () => {
    await store.getState().toggleDoor(cellDoor({ doorState: 'locked' }));

    expect(commands.sent).toEqual([]);
    expect(store.getState().notice).toBe('A porta está trancada.');
  });

  it('the master clicking a locked door opens it', async () => {
    store.getState().allowLayerChoice(true);

    await store.getState().toggleDoor(cellDoor({ doorState: 'locked' }));

    expect(commands.sentAs('setDoor')[0]?.fields).toEqual({ wallId: CELL_DOOR_ID, state: 'open' });
  });

  it('a refused door says why on the status line', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });

    await store.getState().toggleDoor(cellDoor());

    expect(store.getState().notice).toBe('recusado: forbidden');
  });

  it('while reconnecting nothing is sent', async () => {
    store.getState().setReadOnly(true);

    await store.getState().toggleDoor(cellDoor());

    expect(commands.sent).toEqual([]);
  });
});
