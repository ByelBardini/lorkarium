import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { VHARN } from '../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { KAEL_ID } from '../support/table-session-fixtures';

const ONE_BY_ONE = { col: 5, row: 4, width: 1, height: 1 };
const WIDE = { col: 4, row: 4, width: 2, height: 1 };

describe('resizing tokens (token-resize-flow)', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let store: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    recorded = [];
    store = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
      recordEdit: (entry) => recorded.push(entry),
    });
  });

  it('a confirmed resize sends the new box and goes on the undo stack with the old one', async () => {
    const resizes = [{ tokenId: KAEL_ID, from: ONE_BY_ONE, to: WIDE }];

    await store.getState().resizeTokens(resizes, 'Kael agora ocupa 2 × 1 casas.');

    expect(commands.sentAs('resizeTokens')[0]?.fields).toEqual({
      resizes: [{ tokenId: KAEL_ID, ...WIDE }],
    });
    expect(recorded).toEqual([[{ kind: 'tokensResized', resizes }]]);
    expect(store.getState().notice).toBe('Kael agora ocupa 2 × 1 casas.');
  });

  it('while the resize is on its way the token already shows the new box', async () => {
    commands.hold();

    const resizing = store
      .getState()
      .resizeTokens([{ tokenId: KAEL_ID, from: ONE_BY_ONE, to: WIDE }]);

    expect(store.getState().resizePreview).toEqual({ [KAEL_ID]: WIDE });
    commands.release();
    await resizing;
    expect(store.getState().resizePreview).toEqual({});
  });

  it('a refused resize drops the preview, records nothing and says why', async () => {
    commands.answerWith({ ok: false, failure: 'out_of_scene' });

    await store.getState().resizeTokens([{ tokenId: KAEL_ID, from: ONE_BY_ONE, to: WIDE }]);

    expect(store.getState().resizePreview).toEqual({});
    expect(recorded).toEqual([]);
    expect(store.getState().notice).toBe('recusado: out_of_scene');
  });

  it('while reconnecting nothing is sent', async () => {
    store.getState().setReadOnly(true);

    await store.getState().resizeTokens([{ tokenId: KAEL_ID, from: ONE_BY_ONE, to: WIDE }]);

    expect(commands.sent).toEqual([]);
  });

  it('the handle preview is local and null drops it', () => {
    store.getState().previewResize(KAEL_ID, WIDE);
    expect(store.getState().resizePreview).toEqual({ [KAEL_ID]: WIDE });

    store.getState().previewResize(KAEL_ID, null);
    expect(store.getState().resizePreview).toEqual({});
  });
});
