import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  RULER_HINT,
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { VHARN } from '../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { LYRA_ID } from '../support/table-session-fixtures';

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
      expect(store.getState().selectedTokenId).toBe(LYRA_ID);
      store.getState().select(null);
      expect(store.getState().selectedTokenId).toBeNull();
    });

    it('moveToken shows the preview while the command is on its way and sends it', async () => {
      commands.hold();
      const sent = store.getState().moveToken(LYRA_ID, cell(8, 6));
      expect(store.getState().preview).toEqual({ tokenId: LYRA_ID, col: 8, row: 6 });
      expect(commands.sentAs('moveToken')).toEqual([
        { name: 'moveToken', campaignId: VHARN.id, fields: { tokenId: LYRA_ID, col: 8, row: 6 } },
      ]);
      commands.release();
      await sent;
      expect(store.getState().preview).toBeNull();
    });

    it('a refused move drops the preview and says why', async () => {
      commands.answerWith({ ok: false, failure: 'forbidden' });
      await store.getState().moveToken(LYRA_ID, cell(8, 6));
      expect(store.getState()).toMatchObject({ preview: null, notice: 'recusado: forbidden' });
    });

    it('read only (reconnecting) sends nothing and shows no preview', async () => {
      store.getState().setReadOnly(true);
      await store.getState().moveToken(LYRA_ID, cell(8, 6));
      expect(store.getState().preview).toBeNull();
      expect(commands.sent).toEqual([]);
    });

    it('dropPreview forgets a preview (a new snapshot replaced the board)', () => {
      commands.hold();
      void store.getState().moveToken(LYRA_ID, cell(8, 6));
      store.getState().dropPreview();
      expect(store.getState().preview).toBeNull();
    });

    it('adjustBar sends the change and a refusal says why', async () => {
      commands.answerWith({ ok: false, failure: 'rate_limited' });
      await store.getState().adjustBar(LYRA_ID, 'pv', { op: 'add', amount: -7 });
      expect(commands.sentAs('adjustBar')).toHaveLength(1);
      expect(store.getState().notice).toBe('recusado: rate_limited');
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
});
