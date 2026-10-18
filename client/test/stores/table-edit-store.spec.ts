import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import { shapeOfEffectArea } from '@/lib/effect-area-shape';
import { copiedOf } from '@/lib/paste-placement';
import {
  createTableEditStore,
  type EditContext,
  type TableEditStore,
} from '@/stores/table-edit-store';
import { VHARN } from '../support/campaigns-api-fake';
import { PATH_ID, path, SQUARE_ID, square } from '../support/drawing-fixtures';
import { BIA_CONE_ID, biaCone } from '../support/effect-area-fixtures';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { KAEL_ID, LYRA_ID, kael, lyra } from '../support/table-session-fixtures';
import { shapeOfWall } from '@/lib/wall-geometry';
import { NORTH_WALL_ID, northWall } from '../support/wall-fixtures';

const SCENE = { widthCells: 20, heightCells: 12 };
const NEW_GOBLIN = 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b';
const NEW_SQUARE = 'f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c';
const NEW_AREA = 'a3b4c5d6-e7f8-4a9b-8c1d-2e3f4a5b6c7d';
const NEW_WALL = 'b4c5d6e7-f8a9-4b0c-9d2e-3f4a5b6c7d8e';

function lyraMoved(from: number, to: number): EditEntry {
  return [
    {
      kind: 'tokensMoved',
      moves: [{ tokenId: LYRA_ID, from: cell(from, 4), to: cell(to, 4) }],
    },
  ];
}

describe('table edit store', () => {
  let commands: TableBoardCommandsFake;
  let edits: StoreApi<TableEditStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    edits = createTableEditStore(VHARN.id);
  });

  function context(overrides: Partial<EditContext> = {}): EditContext {
    return { campaignId: VHARN.id, commands, isMaster: true, readOnly: false, ...overrides };
  }

  describe('copy and paste', () => {
    beforeEach(() => {
      commands.answerWith({ ok: true, version: 5, createdIds: [NEW_GOBLIN] });
    });

    it('a paste under the cursor creates the copied tokens and drawings, shifted together', async () => {
      edits
        .getState()
        .copy(copiedOf([lyra({ width: 2, height: 2, col: 4, row: 4 }), kael()], [path()]));

      const pasted = await edits.getState().paste(context(), { cursor: cell(10, 6), scene: SCENE });

      expect(pasted).toEqual({ outcome: { kind: 'done' }, skippedTokens: false });
      const tokens = commands.sentAs('createTokens')[0]?.fields as { tokens: { col: number }[] };
      expect(tokens.tokens.map(({ col }) => col)).toEqual([11, 12]);
      expect(commands.sentAs('createDrawings')[0]?.fields).toMatchObject({
        drawings: [{ kind: 'freehand', x: 8, y: 4 }],
      });
    });

    it('a paste goes on the undo stack as one entry with the ids the server gave', async () => {
      edits.getState().copy(copiedOf([lyra()], []));

      await edits.getState().paste(context(), { cursor: cell(10, 6), scene: SCENE });

      expect(edits.getState().history.past).toEqual([
        [
          {
            kind: 'tokensAdded',
            tokens: [{ id: NEW_GOBLIN, token: expect.objectContaining({ col: 10, row: 6 }) }],
          },
        ],
      ]);
    });

    it('pasting twice creates two sets', async () => {
      edits.getState().copy(copiedOf([lyra()], []));

      await edits.getState().paste(context(), { cursor: cell(10, 6), scene: SCENE });
      await edits.getState().paste(context(), { cursor: cell(12, 6), scene: SCENE });

      expect(commands.sentAs('createTokens')).toHaveLength(2);
    });

    it('a player pasting a selection with a token pastes only the drawings and says so', async () => {
      edits.getState().copy(copiedOf([lyra()], [square()]));

      const pasted = await edits.getState().paste(context({ isMaster: false }), {
        cursor: cell(10, 6),
        scene: SCENE,
      });

      expect(pasted.skippedTokens).toBe(true);
      expect(commands.sentAs('createTokens')).toEqual([]);
      expect(commands.sentAs('createDrawings')).toHaveLength(1);
    });

    it('a paste with an area creates it under the cursor and records it with the new id', async () => {
      edits.getState().copy(copiedOf([], [], [biaCone()]));
      commands.answerWith({ ok: true, version: 6, createdIds: [NEW_AREA] });

      await edits.getState().paste(context(), { cursor: cell(10, 6), scene: SCENE });

      const pasted = { kind: 'diagonal_cone', x: 10, y: 6, reach: 3, facing: 45, color: 'ember' };
      expect(commands.sentAs('createEffectAreas')[0]?.fields).toEqual({ effectAreas: [pasted] });
      expect(edits.getState().history.past).toEqual([
        [{ kind: 'effectAreasAdded', effectAreas: [{ id: NEW_AREA, shape: pasted }] }],
      ]);
    });

    it('a player pastes areas too: only the tokens are skipped', async () => {
      edits.getState().copy(copiedOf([lyra()], [], [biaCone()]));

      const pasted = await edits.getState().paste(context({ isMaster: false }), {
        cursor: cell(10, 6),
        scene: SCENE,
      });

      expect(pasted.skippedTokens).toBe(true);
      expect(commands.sentAs('createTokens')).toEqual([]);
      expect(commands.sentAs('createEffectAreas')).toHaveLength(1);
    });

    it('Ctrl+Z after pasting an area deletes it where it was pasted', async () => {
      edits.getState().copy(copiedOf([], [], [biaCone()]));
      commands.answerWith({ ok: true, version: 6, createdIds: [NEW_AREA] });
      await edits.getState().paste(context(), { cursor: cell(10, 6), scene: SCENE });

      await edits.getState().undo(context());

      expect(commands.sentAs('deleteEffectAreas')[0]?.fields).toMatchObject({
        effectAreaIds: [NEW_AREA],
        expect: [{ effectAreaId: NEW_AREA, shape: { x: 10, y: 6 } }],
      });
    });

    it('a paste with nothing copied does nothing', async () => {
      const pasted = await edits.getState().paste(context(), { cursor: null, scene: SCENE });

      expect(pasted.outcome).toEqual({ kind: 'nothing' });
      expect(commands.sent).toEqual([]);
    });

    it('a group bigger than the scene is out of the scene and nothing is sent', async () => {
      edits.getState().copy(copiedOf([], [square({ x: 0, width: 20 })]));

      const pasted = await edits.getState().paste(context(), {
        cursor: cell(1, 1),
        scene: { widthCells: 10, heightCells: 10 },
      });

      expect(pasted.outcome).toEqual({ kind: 'out_of_scene' });
      expect(commands.sent).toEqual([]);
    });

    it('a refused paste creates nothing on the undo stack and says why', async () => {
      commands.answerWith({ ok: false, failure: 'drawing_limit' });
      edits.getState().copy(copiedOf([], [square()]));

      const pasted = await edits.getState().paste(context(), { cursor: cell(5, 5), scene: SCENE });

      expect(pasted.outcome).toEqual({ kind: 'refused', failure: 'drawing_limit' });
      expect(edits.getState().history.past).toEqual([]);
    });

    it('while reconnecting nothing is pasted', async () => {
      edits.getState().copy(copiedOf([lyra()], []));

      await edits.getState().paste(context({ readOnly: true }), { cursor: null, scene: SCENE });

      expect(commands.sent).toEqual([]);
    });
  });

  describe('undo and redo', () => {
    it('Ctrl+Z after moving Lyra from (4,4) to (6,4) moves her back, expecting her on (6,4)', async () => {
      edits.getState().record(lyraMoved(4, 6));

      await edits.getState().undo(context());

      expect(commands.sentAs('moveTokens')[0]?.fields).toEqual({
        moves: [{ tokenId: LYRA_ID, col: 4, row: 4, expect: { col: 6, row: 4 } }],
      });
    });

    it('Ctrl+Y then moves her to (6,4) again, expecting her on (4,4)', async () => {
      edits.getState().record(lyraMoved(4, 6));
      await edits.getState().undo(context());

      await edits.getState().redo(context());

      expect(commands.sentAs('moveTokens')[1]?.fields).toEqual({
        moves: [{ tokenId: LYRA_ID, col: 6, row: 4, expect: { col: 4, row: 4 } }],
      });
      expect(edits.getState().history).toEqual({ past: [lyraMoved(4, 6)], future: [] });
    });

    it('undoing a paste deletes the pasted tokens and drawings where they were pasted', async () => {
      edits.getState().record([
        {
          kind: 'tokensAdded',
          tokens: [
            { id: NEW_GOBLIN, token: { ...copiedOf([kael()], []).tokens[0]!, col: 8, row: 2 } },
          ],
        },
        {
          kind: 'drawingsAdded',
          drawings: [{ id: NEW_SQUARE, shape: copiedOf([], [square()]).drawings[0]! }],
        },
      ]);

      await edits.getState().undo(context());

      expect(commands.sentAs('deleteDrawings')[0]?.fields).toEqual({
        drawingIds: [NEW_SQUARE],
        expect: [{ drawingId: NEW_SQUARE, x: 2.5, y: 3 }],
      });
      expect(commands.sentAs('deleteTokens')[0]?.fields).toEqual({
        tokenIds: [NEW_GOBLIN],
        expect: [{ tokenId: NEW_GOBLIN, col: 8, row: 2 }],
      });
    });

    it('undoing a draw deletes the drawing', async () => {
      const shape = copiedOf([], [path()]).drawings[0]!;
      edits.getState().record([{ kind: 'drawingsAdded', drawings: [{ id: PATH_ID, shape }] }]);

      await edits.getState().undo(context());

      expect(commands.sentAs('deleteDrawings')[0]?.fields).toMatchObject({ drawingIds: [PATH_ID] });
    });

    it('undoing a delete draws it again, and the new id replaces the old one in later entries', async () => {
      const shape = copiedOf([], [square()]).drawings[0]!;
      edits.getState().record([{ kind: 'drawingsRemoved', drawings: [{ id: SQUARE_ID, shape }] }]);
      commands.answerWith({ ok: true, version: 9, createdIds: [NEW_SQUARE] });

      await edits.getState().undo(context());

      expect(commands.sentAs('createDrawings')[0]?.fields).toEqual({ drawings: [shape] });
      expect(edits.getState().history.future).toEqual([
        [{ kind: 'drawingsRemoved', drawings: [{ id: NEW_SQUARE, shape }] }],
      ]);
    });

    it('undoing a created area deletes it, expecting the shape it was created with', async () => {
      const cone = shapeOfEffectArea(biaCone());
      edits
        .getState()
        .record([{ kind: 'effectAreasAdded', effectAreas: [{ id: BIA_CONE_ID, shape: cone }] }]);

      await edits.getState().undo(context());

      expect(commands.sentAs('deleteEffectAreas')[0]?.fields).toEqual({
        effectAreaIds: [BIA_CONE_ID],
        expect: [{ effectAreaId: BIA_CONE_ID, shape: cone }],
      });
    });

    it('undoing a deleted area creates it again, and the new id replaces the old one in later entries', async () => {
      const cone = shapeOfEffectArea(biaCone());
      edits
        .getState()
        .record([{ kind: 'effectAreasRemoved', effectAreas: [{ id: BIA_CONE_ID, shape: cone }] }]);
      commands.answerWith({ ok: true, version: 9, createdIds: [NEW_AREA] });

      await edits.getState().undo(context());

      expect(commands.sentAs('createEffectAreas')[0]?.fields).toEqual({ effectAreas: [cone] });
      expect(edits.getState().history.future).toEqual([
        [{ kind: 'effectAreasRemoved', effectAreas: [{ id: NEW_AREA, shape: cone }] }],
      ]);
    });

    it('undoing a reshape sends the old shape, expecting the new one', async () => {
      const cone = shapeOfEffectArea(biaCone());
      const grown = shapeOfEffectArea(biaCone({ reach: 4 }));
      edits.getState().record([
        {
          kind: 'effectAreasReshaped',
          reshapes: [{ effectAreaId: BIA_CONE_ID, from: cone, to: grown }],
        },
      ]);

      await edits.getState().undo(context());

      expect(commands.sentAs('reshapeEffectAreas')[0]?.fields).toEqual({
        reshapes: [{ effectAreaId: BIA_CONE_ID, shape: cone, expect: grown }],
      });
    });

    it('an area undo refused with stale_undo drops the entry: someone changed it after', async () => {
      const cone = shapeOfEffectArea(biaCone());
      edits
        .getState()
        .record([{ kind: 'effectAreasAdded', effectAreas: [{ id: BIA_CONE_ID, shape: cone }] }]);
      commands.answerWith({ ok: false, failure: 'stale_undo' });

      const outcome = await edits.getState().undo(context());

      expect(outcome).toEqual({ kind: 'refused', failure: 'stale_undo' });
      expect(edits.getState().history.past).toEqual([]);
    });

    it('undoing a created wall deletes it, expecting it where it was created', async () => {
      const shape = shapeOfWall(northWall());
      edits.getState().record([{ kind: 'wallsAdded', walls: [{ id: NORTH_WALL_ID, shape }] }]);

      await edits.getState().undo(context());

      expect(commands.sentAs('deleteWalls')[0]?.fields).toEqual({
        wallIds: [NORTH_WALL_ID],
        expect: [{ wallId: NORTH_WALL_ID, x: 2, y: 2 }],
      });
    });

    it('undoing a deleted wall creates it again, and the new id replaces the old one later', async () => {
      const shape = shapeOfWall(northWall());
      edits.getState().record([{ kind: 'wallsRemoved', walls: [{ id: NORTH_WALL_ID, shape }] }]);
      commands.answerWith({ ok: true, version: 9, createdIds: [NEW_WALL] });

      await edits.getState().undo(context());

      expect(commands.sentAs('createWalls')[0]?.fields).toEqual({ walls: [shape] });
      expect(edits.getState().history.future).toEqual([
        [{ kind: 'wallsRemoved', walls: [{ id: NEW_WALL, shape }] }],
      ]);
    });

    it('undoing a change of kind sends the old kind, expecting the new one', async () => {
      edits.getState().record([
        {
          kind: 'wallsKindChanged',
          changes: [{ wallId: NORTH_WALL_ID, from: 'wall', to: 'door' }],
        },
      ]);

      await edits.getState().undo(context());

      expect(commands.sentAs('setWallKinds')[0]?.fields).toEqual({
        wallIds: [NORTH_WALL_ID],
        kind: 'wall',
        expect: [{ wallId: NORTH_WALL_ID, kind: 'door' }],
      });
    });

    it('a wall undo refused with stale_undo drops the entry', async () => {
      edits.getState().record([
        {
          kind: 'wallsKindChanged',
          changes: [{ wallId: NORTH_WALL_ID, from: 'wall', to: 'grate' }],
        },
      ]);
      commands.answerWith({ ok: false, failure: 'stale_undo' });

      await edits.getState().undo(context());

      expect(commands.sentAs('setWallKinds')[0]?.fields).toMatchObject({
        wallIds: [NORTH_WALL_ID],
      });
      expect(edits.getState().history.past).toEqual([]);
    });

    it('undoing a move around a wall sends the reversed path, expecting the token where it went', async () => {
      edits.getState().record([
        {
          kind: 'tokensMoved',
          moves: [
            { tokenId: LYRA_ID, from: cell(3, 4), to: cell(7, 4), path: [cell(3, 7), cell(7, 7)] },
          ],
        },
      ]);

      await edits.getState().undo(context());

      expect(commands.sentAs('moveTokens')[0]?.fields).toEqual({
        moves: [
          {
            tokenId: LYRA_ID,
            col: 3,
            row: 4,
            expect: { col: 7, row: 4 },
            path: [
              { col: 7, row: 7 },
              { col: 3, row: 7 },
            ],
          },
        ],
      });
    });

    it('undoing 3 and redoing 3 with nobody in between sends the 3 moves again in order', async () => {
      [lyraMoved(1, 2), lyraMoved(2, 3), lyraMoved(3, 4)].forEach((entry) =>
        edits.getState().record(entry),
      );
      for (let step = 0; step < 3; step += 1) await edits.getState().undo(context());

      for (let step = 0; step < 3; step += 1) await edits.getState().redo(context());

      const redone = commands.sentAs('moveTokens').slice(3);
      expect(
        redone.map(({ fields }) => (fields as { moves: { col: number }[] }).moves[0]?.col),
      ).toEqual([2, 3, 4]);
      expect(edits.getState().history.past).toEqual([
        lyraMoved(1, 2),
        lyraMoved(2, 3),
        lyraMoved(3, 4),
      ]);
    });

    it('Ctrl+Z after turning Kael from 0 to 45 turns him back, expecting him at 45', async () => {
      edits
        .getState()
        .record([{ kind: 'tokensFaced', turns: [{ tokenId: LYRA_ID, from: 0, to: 45 }] }]);

      await edits.getState().undo(context());

      expect(commands.sentAs('faceTokens')[0]?.fields).toEqual({
        faces: [{ tokenId: LYRA_ID, facing: 0, expect: { facing: 45 } }],
      });
    });

    it('Ctrl+Z after stretching Lyra to 2×1 shrinks her back, expecting the 2×1 box', async () => {
      const small = { col: 3, row: 4, width: 1, height: 1 };
      const wide = { col: 3, row: 4, width: 2, height: 1 };
      edits
        .getState()
        .record([
          { kind: 'tokensResized', resizes: [{ tokenId: LYRA_ID, from: small, to: wide }] },
        ]);

      await edits.getState().undo(context());

      expect(commands.sentAs('resizeTokens')[0]?.fields).toEqual({
        resizes: [{ tokenId: LYRA_ID, ...small, expect: wide }],
      });
    });

    it('an undo refused with stale_undo leaves the stack: someone moved it after', async () => {
      edits.getState().record(lyraMoved(4, 6));
      commands.answerWith({ ok: false, failure: 'stale_undo' });

      const outcome = await edits.getState().undo(context());

      expect(outcome).toEqual({ kind: 'refused', failure: 'stale_undo' });
      expect(edits.getState().history).toEqual({ past: [], future: [] });
    });

    it('an undo with no answer (offline) keeps the entry to try again', async () => {
      edits.getState().record(lyraMoved(4, 6));
      commands.answerWith({ ok: false, failure: 'offline' });

      await edits.getState().undo(context());

      expect(edits.getState().history.past).toEqual([lyraMoved(4, 6)]);
    });

    it('while reconnecting an undo sends nothing and keeps the entry', async () => {
      edits.getState().record(lyraMoved(4, 6));

      const outcome = await edits.getState().undo(context({ readOnly: true }));

      expect(outcome).toEqual({ kind: 'nothing' });
      expect(commands.sent).toEqual([]);
      expect(edits.getState().history.past).toHaveLength(1);
    });

    it('undo and redo with empty stacks do nothing', async () => {
      expect(await edits.getState().undo(context())).toEqual({ kind: 'nothing' });
      expect(await edits.getState().redo(context())).toEqual({ kind: 'nothing' });
      expect(commands.sent).toEqual([]);
    });

    it('a second undo while the first is on its way does nothing', async () => {
      edits.getState().record(lyraMoved(4, 6));
      edits.getState().record(lyraMoved(6, 8));
      commands.hold();

      const first = edits.getState().undo(context());
      const second = await edits.getState().undo(context());
      commands.release();
      await first;

      expect(second).toEqual({ kind: 'nothing' });
      expect(commands.sentAs('moveTokens')).toHaveLength(1);
    });
  });

  it('a move of Kael recorded by the room lands on the undo stack', () => {
    const entry: EditEntry = [
      { kind: 'tokensMoved', moves: [{ tokenId: KAEL_ID, from: cell(5, 4), to: cell(6, 4) }] },
    ];

    edits.getState().record(entry);

    expect(edits.getState().history.past).toEqual([entry]);
  });
});
