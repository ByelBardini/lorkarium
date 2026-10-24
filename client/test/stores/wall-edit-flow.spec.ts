import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import { shapeOfWall } from '@/lib/wall-geometry';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import {
  CELL_DOOR_ID,
  GRATE_BOX_ID,
  NORTH_WALL_ID,
  cellDoor,
  grateBox,
  northWall,
} from '../support/wall-fixtures';
import { VHARN_GRID } from '../support/table-session-fixtures';

const REST_ID = 'd6e7f8a9-b0c1-4d2e-8f3a-4b5c6d7e8f90';

describe('editing walls', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let store: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    recorded = [];
    store = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
      recordEdit: (entry) => recorded.push(entry),
    });
  });

  it('deleting two walls is one deleteWalls, recorded with their shapes, and they leave the selection', async () => {
    store.getState().pointer({ kind: 'wallPicked', wallId: NORTH_WALL_ID, additive: false });

    await store.getState().deleteWalls([northWall(), grateBox()]);

    expect(commands.sentAs('deleteWalls')[0]?.fields).toMatchObject({
      wallIds: [NORTH_WALL_ID, GRATE_BOX_ID],
    });
    expect(store.getState().selectedWallIds).toEqual([]);
    expect(recorded[0]?.[0]).toMatchObject({
      kind: 'wallsRemoved',
      walls: [
        { id: NORTH_WALL_ID, shape: { kind: 'wall', shape: 'line', x: 2, y: 2 } },
        { id: GRATE_BOX_ID, shape: { kind: 'grate', shape: 'rectangle', x: 8, y: 3 } },
      ],
    });
  });

  it('changing the kind of two walls is one setWallKinds, recorded with the kinds they had', async () => {
    await store.getState().changeWallKinds([northWall(), cellDoor()], 'grate');

    expect(commands.sentAs('setWallKinds')[0]?.fields).toEqual({
      wallIds: [NORTH_WALL_ID, CELL_DOOR_ID],
      kind: 'grate',
      expect: undefined,
    });
    expect(recorded).toEqual([
      [
        {
          kind: 'wallsKindChanged',
          changes: [
            { wallId: NORTH_WALL_ID, from: 'wall', to: 'grate' },
            { wallId: CELL_DOOR_ID, from: 'door', to: 'grate' },
          ],
        },
      ],
    ]);
  });

  it('Porta with a rectangle selected sends nothing and says "Só parede reta vira porta."', async () => {
    await store.getState().changeWallKinds([northWall(), grateBox()], 'door');

    expect(commands.sent).toEqual([]);
    expect(store.getState().notice).toBe('Só parede reta vira porta.');
  });

  it('a click on a wall selects it alone, and Shift adds the next one', () => {
    store.getState().pointer({ kind: 'wallPicked', wallId: NORTH_WALL_ID, additive: false });
    store.getState().pointer({ kind: 'wallPicked', wallId: CELL_DOOR_ID, additive: true });

    expect(store.getState().selectedWallIds).toEqual([NORTH_WALL_ID, CELL_DOOR_ID]);
  });

  it('changing tools drops the selected walls', () => {
    store.getState().allowLayerChoice(true);
    store.getState().setTool('walls');
    store.getState().pointer({ kind: 'wallPicked', wallId: NORTH_WALL_ID, additive: false });

    store.getState().setTool('select');

    expect(store.getState().selectedWallIds).toEqual([]);
  });

  it('erasing the whole box is one deleteWalls, recorded with its shape', async () => {
    await store.getState().eraseWall(grateBox(), null);

    expect(commands.sentAs('deleteWalls')[0]?.fields).toMatchObject({ wallIds: [GRATE_BOX_ID] });
    expect(recorded).toEqual([
      [{ kind: 'wallsRemoved', walls: [{ id: GRATE_BOX_ID, shape: shapeOfWall(grateBox()) }] }],
    ]);
  });

  it('erasing the top side of the box is one eraseWallSegment, recorded as the box out and the rest in', async () => {
    commands.answerWith({ ok: true, version: 6, createdIds: [REST_ID] });

    await store.getState().eraseWall(grateBox(), 0);

    expect(commands.sentAs('eraseWallSegment')[0]?.fields).toEqual({
      wallId: GRATE_BOX_ID,
      segmentIndex: 0,
      expect: { x: 8, y: 3 },
    });
    expect(recorded).toEqual([
      [
        { kind: 'wallsRemoved', walls: [{ id: GRATE_BOX_ID, shape: shapeOfWall(grateBox()) }] },
        {
          kind: 'wallsAdded',
          walls: [
            {
              id: REST_ID,
              shape: {
                kind: 'grate',
                shape: 'freehand',
                x: 8,
                y: 3,
                width: 2,
                height: 2,
                points: [
                  [2, 0],
                  [2, 2],
                  [0, 2],
                  [0, 0],
                ],
              },
            },
          ],
        },
      ],
    ]);
  });

  it('a refused erase says why and records nothing', async () => {
    commands.answerWith({ ok: false, failure: 'wall_not_found' });

    await store.getState().eraseWall(grateBox(), 0);

    expect(store.getState().notice).toBe('recusado: wall_not_found');
    expect(recorded).toEqual([]);
  });

  it('an erased wall leaves the selection', async () => {
    store.getState().pointer({ kind: 'wallPicked', wallId: GRATE_BOX_ID, additive: false });

    await store.getState().eraseWall(grateBox(), 1);

    expect(store.getState().selectedWallIds).toEqual([]);
  });

  it('the eraser box over the middle of the north wall is one eraseWallArea, recorded as the wall out and its ends in', async () => {
    commands.answerWith({ ok: true, version: 6, createdIds: [REST_ID, CELL_DOOR_ID] });

    await store
      .getState()
      .eraseWallArea([northWall(), grateBox()], { x: 3, y: 1, width: 2, height: 2 });

    expect(commands.sentAs('eraseWallArea')[0]?.fields).toEqual({
      box: { x: 3, y: 1, width: 2, height: 2 },
    });
    expect(recorded).toEqual([
      [
        { kind: 'wallsRemoved', walls: [{ id: NORTH_WALL_ID, shape: shapeOfWall(northWall()) }] },
        {
          kind: 'wallsAdded',
          walls: [
            { id: REST_ID, shape: expect.objectContaining({ shape: 'line', x: 2, width: 1 }) },
            { id: CELL_DOOR_ID, shape: expect.objectContaining({ shape: 'line', x: 5, width: 1 }) },
          ],
        },
      ],
    ]);
  });

  it('an eraser box over no wall sends nothing and says "Nada para apagar aqui."', async () => {
    await store.getState().eraseWallArea([northWall()], { x: 0, y: 8, width: 1, height: 1 });

    expect(commands.sent).toEqual([]);
    expect(store.getState().notice).toBe('Nada para apagar aqui.');
  });

  it('any action of the walls tool drops the selected walls', () => {
    store.getState().pointer({ kind: 'wallPicked', wallId: NORTH_WALL_ID, additive: false });

    store.getState().setWallMode('eraseSegment');

    expect(store.getState().wallMode).toBe('eraseSegment');
    expect(store.getState().selectedWallIds).toEqual([]);
  });
});
