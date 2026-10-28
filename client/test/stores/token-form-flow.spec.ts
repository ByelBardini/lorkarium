import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { LYRA_ID, VHARN_GRID, VHARN_SCENE } from '../support/table-session-fixtures';
import {
  BASE_FORM_ID,
  RAVEN_FORM_ID,
  WOLF_FORM_ID,
  shapeshiftingLyra,
} from '../support/token-form-fixtures';

const WOLF_BOX = { col: 3, row: 4, width: 2, height: 2 };

describe('switching a token to a form (token-form-flow)', () => {
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

  function switchTo(formId: string, token = shapeshiftingLyra()): Promise<void> {
    return store.getState().setTokenForm({ token, formId, scene: VHARN_SCENE });
  }

  it('a confirmed switch sends the form, goes on the undo stack and says what she became', async () => {
    await switchTo(WOLF_FORM_ID);

    expect(commands.sentAs('setTokenForm')).toEqual([
      { name: 'setTokenForm', ...VHARN_GRID, fields: { tokenId: LYRA_ID, formId: WOLF_FORM_ID } },
    ]);
    expect(recorded).toEqual([
      [{ kind: 'tokenFormChanged', tokenId: LYRA_ID, from: BASE_FORM_ID, to: WOLF_FORM_ID }],
    ]);
    expect(store.getState().notice).toBe('Lyra agora é Lobo atroz.');
  });

  it('while the switch is on its way the token already shows the box of the form', async () => {
    commands.hold();

    const switching = switchTo(WOLF_FORM_ID);

    expect(store.getState().resizePreview).toEqual({ [LYRA_ID]: WOLF_BOX });
    commands.release();
    await switching;
    expect(store.getState().resizePreview).toEqual({});
  });

  it('near the edge the preview steps back into the scene', async () => {
    commands.hold();

    const switching = switchTo(WOLF_FORM_ID, shapeshiftingLyra({ col: 19, row: 11 }));

    expect(store.getState().resizePreview).toEqual({
      [LYRA_ID]: { col: 18, row: 10, width: 2, height: 2 },
    });
    commands.release();
    await switching;
  });

  it('a switch from no active form is sent but not recorded: there is no form to go back to', async () => {
    await switchTo(RAVEN_FORM_ID, shapeshiftingLyra({ activeFormId: null }));

    expect(commands.sentAs('setTokenForm')).toHaveLength(1);
    expect(recorded).toEqual([]);
  });

  it.each([
    ['the form already active', BASE_FORM_ID],
    ['a form the token does not have', 'c0ffee00-0000-4000-8000-00000000f0f0'],
  ])('%s sends nothing', async (_case, formId) => {
    await switchTo(formId);

    expect(commands.sent).toEqual([]);
    expect(store.getState().resizePreview).toEqual({});
  });

  it('a form bigger than the scene sends nothing and says it does not fit', async () => {
    const giant = {
      id: RAVEN_FORM_ID,
      name: 'Dragão',
      imageAssetId: null,
      width: 10,
      height: 10,
      frame: 'round' as const,
    };
    const tiny = { ...VHARN_SCENE, widthCells: 4, heightCells: 4 };

    await store.getState().setTokenForm({
      token: shapeshiftingLyra({ forms: [giant] }),
      formId: RAVEN_FORM_ID,
      scene: tiny,
    });

    expect(commands.sent).toEqual([]);
    expect(store.getState().notice).toBe('recusado: out_of_scene');
  });

  it('a refused switch drops the preview, records nothing and says why', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });

    await switchTo(WOLF_FORM_ID);

    expect(store.getState().resizePreview).toEqual({});
    expect(recorded).toEqual([]);
    expect(store.getState().notice).toBe('recusado: forbidden');
  });

  it('while reconnecting nothing is sent', async () => {
    store.getState().setReadOnly(true);

    await switchTo(WOLF_FORM_ID);

    expect(commands.sent).toEqual([]);
  });
});
