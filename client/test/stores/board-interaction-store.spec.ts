import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  RULER_HINT,
  createBoardInteractionStore,
  singleSelectedOf,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { ROUTE_BEND_DWELL_MS, routePath } from '@/lib/token-route';
import { VHARN } from '../support/campaigns-api-fake';
import { InteractionClockFake } from '../support/interaction-clock-fake';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { KAEL_ID, LYRA_ID } from '../support/table-session-fixtures';

describe('board interaction store', () => {
  let store: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    store = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
  });

  it('starts on the select tool with the local grid on, no ruler, no notice and zoom 100%', () => {
    expect(store.getState()).toMatchObject({
      tool: 'select',
      localGridVisible: true,
      ruler: null,
      notice: null,
      zoom: 1,
    });
  });

  it('the ruler tool hints "Arraste para medir." and measures from the press to the pointer', () => {
    store.getState().setTool('ruler');
    expect(store.getState().notice).toBe(RULER_HINT);
    store.getState().pointer({ kind: 'pointerDown', cell: cell(0, 0) });
    store.getState().pointer({ kind: 'pointerMove', cell: cell(3, 2) });
    expect(store.getState().ruler).toEqual({ from: cell(0, 0), to: cell(3, 2) });
  });

  it('the ruler stays after the release and a new press starts a new one', () => {
    store.getState().setTool('ruler');
    store.getState().pointer({ kind: 'pointerDown', cell: cell(0, 0) });
    store.getState().pointer({ kind: 'pointerUp', cell: cell(2, 0) });
    expect(store.getState().ruler).toEqual({ from: cell(0, 0), to: cell(2, 0) });
    store.getState().pointer({ kind: 'pointerDown', cell: cell(5, 5) });
    expect(store.getState().ruler).toEqual({ from: cell(5, 5), to: cell(5, 5) });
  });

  it('moving off the scene keeps the last cell measured', () => {
    store.getState().setTool('ruler');
    store.getState().pointer({ kind: 'pointerDown', cell: cell(1, 1) });
    store.getState().pointer({ kind: 'pointerMove', cell: null });
    expect(store.getState().ruler).toEqual({ from: cell(1, 1), to: cell(1, 1) });
  });

  it('with the select tool the pointer measures nothing', () => {
    store.getState().pointer({ kind: 'pointerDown', cell: cell(0, 0) });
    expect(store.getState().ruler).toBeNull();
  });

  it('escape drops the ruler and the notice; going back to select does too', () => {
    store.getState().setTool('ruler');
    store.getState().pointer({ kind: 'pointerDown', cell: cell(0, 0) });
    store.getState().escape();
    expect(store.getState()).toMatchObject({ ruler: null, tool: 'ruler' });
    store.getState().pointer({ kind: 'pointerDown', cell: cell(0, 0) });
    store.getState().setTool('select');
    expect(store.getState()).toMatchObject({ ruler: null, notice: null });
  });

  it('toggleLocalGrid hides and shows the grid for this viewer', () => {
    store.getState().toggleLocalGrid();
    expect(store.getState().localGridVisible).toBe(false);
    store.getState().toggleLocalGrid();
    expect(store.getState().localGridVisible).toBe(true);
  });

  it('a camera change records the zoom', () => {
    store.getState().pointer({ kind: 'cameraChanged', zoom: 1.25 });
    expect(store.getState().zoom).toBe(1.25);
  });

  it('say() puts a notice on the status line', () => {
    store.getState().say('Esse token não é seu.');
    expect(store.getState().notice).toBe('Esse token não é seu.');
  });

  describe('tokens', () => {
    it('select keeps the selected token and null clears it', () => {
      store.getState().select(LYRA_ID);
      expect(store.getState().selectedTokenIds).toEqual([LYRA_ID]);
      store.getState().select(null);
      expect(store.getState().selectedTokenIds).toEqual([]);
    });

    it('moveToken shows the preview while the command is on its way and sends it', async () => {
      commands.hold();
      const sent = store.getState().moveToken(LYRA_ID, cell(8, 6));
      expect(store.getState().preview).toEqual([{ tokenId: LYRA_ID, col: 8, row: 6 }]);
      expect(commands.sentAs('moveToken')).toEqual([
        { name: 'moveToken', campaignId: VHARN.id, fields: { tokenId: LYRA_ID, col: 8, row: 6 } },
      ]);
      commands.release();
      await sent;
      expect(store.getState().preview).toEqual([]);
    });

    it('a refused move drops the preview and says why', async () => {
      commands.answerWith({ ok: false, failure: 'forbidden' });
      await store.getState().moveToken(LYRA_ID, cell(8, 6));
      expect(store.getState()).toMatchObject({ preview: [], notice: 'recusado: forbidden' });
    });

    it('read only (reconnecting) sends nothing and shows no preview', async () => {
      store.getState().setReadOnly(true);
      await store.getState().moveToken(LYRA_ID, cell(8, 6));
      expect(store.getState().preview).toEqual([]);
      expect(commands.sent).toEqual([]);
    });

    it('dropPreview forgets a preview (a new snapshot replaced the board)', () => {
      commands.hold();
      void store.getState().moveToken(LYRA_ID, cell(8, 6));
      store.getState().dropPreview();
      expect(store.getState().preview).toEqual([]);
    });

    it('adjustBar sends the change and a refusal says why', async () => {
      commands.answerWith({ ok: false, failure: 'rate_limited' });
      await store.getState().adjustBar(LYRA_ID, 'pv', { op: 'add', amount: -7 });
      expect(commands.sentAs('adjustBar')).toHaveLength(1);
      expect(store.getState().notice).toBe('recusado: rate_limited');
    });
  });

  describe('selection', () => {
    it('select(id) selects that one token; the single selected id is it', () => {
      store.getState().select(LYRA_ID);
      expect(store.getState().selectedTokenIds).toEqual([LYRA_ID]);
      expect(singleSelectedOf(store.getState().selectedTokenIds)).toBe(LYRA_ID);
    });

    it('toggleSelection adds a token and, again, takes it out', () => {
      store.getState().select(LYRA_ID);
      store.getState().toggleSelection(KAEL_ID);
      expect(store.getState().selectedTokenIds).toEqual([LYRA_ID, KAEL_ID]);
      store.getState().toggleSelection(LYRA_ID);
      expect(store.getState().selectedTokenIds).toEqual([KAEL_ID]);
    });

    it('with two selected there is no single selected id', () => {
      store.getState().selectMany([LYRA_ID, KAEL_ID], { additive: false });
      expect(singleSelectedOf(store.getState().selectedTokenIds)).toBeNull();
    });

    it('selectMany replaces the selection, and additive adds without repeating', () => {
      store.getState().select(LYRA_ID);
      store.getState().selectMany([KAEL_ID], { additive: false });
      expect(store.getState().selectedTokenIds).toEqual([KAEL_ID]);
      store.getState().selectMany([LYRA_ID, KAEL_ID], { additive: true });
      expect(store.getState().selectedTokenIds).toEqual([KAEL_ID, LYRA_ID]);
    });

    it('a marquee of the board replaces the selection, and with Shift adds to it', () => {
      store.getState().select(LYRA_ID);
      store.getState().pointer({ kind: 'tokensMarqueed', tokenIds: [KAEL_ID], additive: false });
      expect(store.getState().selectedTokenIds).toEqual([KAEL_ID]);
      store.getState().pointer({ kind: 'tokensMarqueed', tokenIds: [LYRA_ID], additive: true });
      expect(store.getState().selectedTokenIds).toEqual([KAEL_ID, LYRA_ID]);
    });

    it('a Shift+click on a token toggles it in the selection; a plain click selects only it', () => {
      store.getState().select(LYRA_ID);
      store.getState().pointer({ kind: 'tokenPicked', tokenId: KAEL_ID, additive: true });
      expect(store.getState().selectedTokenIds).toEqual([LYRA_ID, KAEL_ID]);
      store.getState().pointer({ kind: 'tokenPicked', tokenId: KAEL_ID, additive: false });
      expect(store.getState().selectedTokenIds).toEqual([KAEL_ID]);
    });

    it('Esc empties the selection', () => {
      store.getState().selectMany([LYRA_ID, KAEL_ID], { additive: false });
      store.getState().escape();
      expect(store.getState().selectedTokenIds).toEqual([]);
    });
  });

  describe('active layer', () => {
    it('starts on the tokens layer, and a player who may not choose stays there', () => {
      store.getState().setActiveLayer('objects');
      expect(store.getState().activeLayer).toBe('tokens');
    });

    it('the master choosing objects clears the selection and the ruler', () => {
      store.getState().allowLayerChoice(true);
      store.getState().setTool('ruler');
      store.getState().pointer({ kind: 'pointerDown', cell: cell(0, 0) });
      store.getState().select(LYRA_ID);
      store.getState().setActiveLayer('objects');
      expect(store.getState()).toMatchObject({
        activeLayer: 'objects',
        selectedTokenIds: [],
        ruler: null,
      });
    });

    it('losing the choice (no longer master) goes back to the tokens layer', () => {
      store.getState().allowLayerChoice(true);
      store.getState().setActiveLayer('background');
      store.getState().allowLayerChoice(false);
      expect(store.getState().activeLayer).toBe('tokens');
    });

    it('setTokensLayer sends the layer change of the tokens', async () => {
      await store.getState().setTokensLayer([LYRA_ID, KAEL_ID], 'objects');
      expect(commands.sentAs('setTokenLayer')).toEqual([
        {
          name: 'setTokenLayer',
          campaignId: VHARN.id,
          fields: { tokenIds: [LYRA_ID, KAEL_ID], layer: 'objects' },
        },
      ]);
    });

    it('a refused layer change says why', async () => {
      commands.answerWith({ ok: false, failure: 'forbidden' });
      await store.getState().setTokensLayer([LYRA_ID], 'objects');
      expect(store.getState().notice).toBe('recusado: forbidden');
    });

    it('read only sends no layer change', async () => {
      store.getState().setReadOnly(true);
      await store.getState().setTokensLayer([LYRA_ID], 'objects');
      expect(commands.sent).toEqual([]);
    });
  });

  describe('command', () => {
    it('sends the command with the table and answers whether it was confirmed', async () => {
      expect(await store.getState().command((c, id) => c.endCombat(id))).toBe(true);
      expect(commands.sentAs('endCombat')).toEqual([
        { name: 'endCombat', campaignId: VHARN.id, fields: {} },
      ]);
    });

    it('a refusal says why and answers false', async () => {
      commands.answerWith({ ok: false, failure: 'turn_changed' });
      expect(await store.getState().command((c, id) => c.nextTurn(id, 'kael'))).toBe(false);
      expect(store.getState().notice).toBe('recusado: turn_changed');
    });

    it('read only sends nothing', async () => {
      store.getState().setReadOnly(true);
      expect(await store.getState().command((c, id) => c.endCombat(id))).toBe(false);
      expect(commands.sent).toEqual([]);
    });
  });

  describe('dragging a token', () => {
    const ORIGIN = cell(3, 4);
    let clock: InteractionClockFake;

    beforeEach(() => {
      clock = new InteractionClockFake();
      store = createBoardInteractionStore({
        campaignId: VHARN.id,
        commands,
        describeRefusal: (failure) => `recusado: ${failure}`,
        clock,
      });
    });

    const ALONE = {
      scene: { widthCells: 20, heightCells: 12 },
      members: [{ tokenId: LYRA_ID, col: 3, row: 4, size: 1 }],
    };

    function over(at: ReturnType<typeof cell> | null): void {
      store.getState().dragOver(LYRA_ID, ORIGIN, at, ALONE);
    }

    // A token dragged alone goes out as a group of one: each preview names only Lyra.
    function dragCells(): unknown[] {
      return commands
        .sentAs('dragTokens')
        .flatMap(({ fields }) => (fields as { drags: unknown[] }).drags);
    }

    it('each new cell becomes the end of the route and goes to the table as a preview', () => {
      over(cell(4, 4));
      expect(store.getState().drag?.route.current).toEqual(cell(4, 4));
      expect(dragCells()).toEqual([{ tokenId: LYRA_ID, cell: cell(4, 4) }]);
    });

    it('standing still 2 s on a cell bends the route there', () => {
      over(cell(6, 4));
      clock.advance(ROUTE_BEND_DWELL_MS);
      over(cell(6, 1));
      const route = store.getState().drag?.route;
      expect(route && routePath(route)).toEqual([ORIGIN, cell(6, 4), cell(6, 1)]);
    });

    it('the bend shows while the token is still standing there, before any other move', () => {
      over(cell(6, 4));
      clock.advance(ROUTE_BEND_DWELL_MS);
      expect(store.getState().drag?.route.bends).toEqual([cell(6, 4)]);
    });

    it('moving on before 2 s bends nothing', () => {
      over(cell(6, 4));
      clock.advance(ROUTE_BEND_DWELL_MS - 1);
      over(cell(6, 1));
      expect(store.getState().drag?.route.bends).toEqual([]);
    });

    it('off the scene the route keeps its last cell and nothing is sent', () => {
      over(cell(4, 4));
      over(null);
      expect(store.getState().drag?.route.current).toEqual(cell(4, 4));
      expect(dragCells()).toHaveLength(1);
    });

    it('the drop ends the drag and sends the move, with the ghost on the way', async () => {
      over(cell(6, 4));
      const dropped = store.getState().dropToken(LYRA_ID, cell(6, 4));
      expect(store.getState()).toMatchObject({
        drag: null,
        preview: [{ tokenId: LYRA_ID, col: 6, row: 4 }],
      });
      await dropped;
      expect(commands.sentAs('moveToken').map(({ fields }) => fields)).toEqual([
        { tokenId: LYRA_ID, col: 6, row: 4 },
      ]);
    });

    it('the move waits for the preview still on its way, so token:moved comes last', async () => {
      commands.hold();
      over(cell(6, 4));
      const dropped = store.getState().dropToken(LYRA_ID, cell(6, 4));
      await Promise.resolve();
      expect(commands.sentAs('moveToken')).toHaveLength(0);
      commands.release();
      await dropped;
      expect(commands.sent.map(({ name }) => name)).toEqual(['dragTokens', 'moveToken']);
    });

    it('a drop back on its own cell moves nothing and puts the token back for the others', async () => {
      over(cell(4, 4));
      clock.advance(1000);
      await store.getState().dropToken(LYRA_ID, ORIGIN);
      expect(commands.sentAs('moveToken')).toEqual([]);
      expect(dragCells().at(-1)).toEqual({ tokenId: LYRA_ID, cell: null });
    });

    it('a drop off the scene moves nothing and puts the token back for the others', async () => {
      over(cell(4, 4));
      await store.getState().dropToken(LYRA_ID, null);
      expect(store.getState().drag).toBeNull();
      expect(commands.sentAs('moveToken')).toEqual([]);
      expect(dragCells().at(-1)).toEqual({ tokenId: LYRA_ID, cell: null });
    });

    it('Esc cancels the drag: no move, and null tells the others after the cell before it', async () => {
      over(cell(4, 4));
      store.getState().escape();
      expect(store.getState().drag).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(commands.sentAs('moveToken')).toEqual([]);
      expect(dragCells().at(-1)).toEqual({ tokenId: LYRA_ID, cell: null });
    });

    it('a bend timer that fires after the drag ended changes nothing', () => {
      over(cell(6, 4));
      store.getState().cancelDrag();
      clock.advance(ROUTE_BEND_DWELL_MS);
      expect(store.getState().drag).toBeNull();
    });

    it('read only (reconnecting) drops the drag and drags nothing more', () => {
      over(cell(4, 4));
      store.getState().setReadOnly(true);
      over(cell(5, 4));
      expect(store.getState().drag).toBeNull();
      expect(dragCells()).toHaveLength(1);
    });
  });
});
