import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { KAEL_ID, LYRA_ID, VHARN_GRID } from '../support/table-session-fixtures';

describe('turning tokens (token-facing-flow)', () => {
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

  it('a confirmed turn goes on the undo stack with where each token looked before', async () => {
    const turns = [{ tokenId: KAEL_ID, from: 0, to: 45 }];

    await store.getState().faceTokens(turns, 'Kael olha para o sudoeste.');

    expect(commands.sentAs('faceTokens')[0]?.fields).toEqual({
      faces: [{ tokenId: KAEL_ID, facing: 45 }],
    });
    expect(recorded).toEqual([[{ kind: 'tokensFaced', turns }]]);
    expect(store.getState().notice).toBe('Kael olha para o sudoeste.');
  });

  it('while the turn is on its way the token already shows the new facing', async () => {
    commands.hold();

    const turning = store.getState().faceTokens([{ tokenId: LYRA_ID, from: 90, to: 180 }]);

    expect(store.getState().facingPreview).toEqual({ [LYRA_ID]: 180 });
    commands.release();
    await turning;
    expect(store.getState().facingPreview).toEqual({});
  });

  it('a refused turn drops the preview, records nothing and says why', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });

    await store.getState().faceTokens([{ tokenId: KAEL_ID, from: 0, to: 45 }]);

    expect(store.getState().facingPreview).toEqual({});
    expect(recorded).toEqual([]);
    expect(store.getState().notice).toBe('recusado: forbidden');
  });

  it('while reconnecting nothing is sent', async () => {
    store.getState().setReadOnly(true);

    await store.getState().faceTokens([{ tokenId: KAEL_ID, from: 0, to: 45 }]);

    expect(commands.sent).toEqual([]);
  });

  it('the handle preview is local and null drops it', () => {
    store.getState().previewFacing(KAEL_ID, 270);
    expect(store.getState().facingPreview).toEqual({ [KAEL_ID]: 270 });

    store.getState().previewFacing(KAEL_ID, null);
    expect(store.getState().facingPreview).toEqual({});
  });
});
