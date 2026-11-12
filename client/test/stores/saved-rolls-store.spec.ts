import { describe, expect, it } from 'vitest';
import { createSavedRollsStore, savedRollsStoreOf } from '@/stores/saved-rolls-store';
import { VHARN } from '../support/campaigns-api-fake';
import { ACERTO, BENCAO } from '../support/dice-fixtures';
import { CREATED_SAVED_ROLL_ID, SavedRollsApiFake } from '../support/saved-rolls-api-fake';

const OTHER_TABLE_ID = 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b';
const ATAQUE = { name: 'Ataque', parts: [{ label: null, expression: '1d20+5' }] };

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('savedRollsStoreOf', () => {
  it('the same api and table give the same store; another table or api, another one', () => {
    const api = new SavedRollsApiFake();
    const shared = savedRollsStoreOf(api, VHARN.id);

    expect(savedRollsStoreOf(api, VHARN.id)).toBe(shared);
    expect(savedRollsStoreOf(api, OTHER_TABLE_ID)).not.toBe(shared);
    expect(savedRollsStoreOf(new SavedRollsApiFake(), VHARN.id)).not.toBe(shared);
  });

  // Regression: a roll saved in the "Dados" tab was an unknown command for the chat drawer open
  // beside it ("/ataque" stayed in the composer), each screen kept its own list (2026-11-12).
  it('a roll created through one holder is in the list every other holder reads', async () => {
    const api = new SavedRollsApiFake();
    api.rolls.set(VHARN.id, [ACERTO]);
    savedRollsStoreOf(api, VHARN.id).getState().load();
    await settled();

    await savedRollsStoreOf(api, VHARN.id).getState().create(ATAQUE);

    const names = savedRollsStoreOf(api, VHARN.id)
      .getState()
      .rolls?.map((roll) => roll.name);
    expect(names).toEqual(['Acerto', 'Ataque']);
  });
});

describe('createSavedRollsStore', () => {
  it('is null until the first list arrives, then holds the rolls and the folders', async () => {
    const api = new SavedRollsApiFake();
    api.rolls.set(VHARN.id, [ACERTO, BENCAO]);
    api.folders.set(VHARN.id, [{ id: 'folder-1', name: 'Combate' }]);
    const store = createSavedRollsStore(api, VHARN.id);

    store.getState().load();
    expect(store.getState().rolls).toBeNull();
    await settled();

    expect(store.getState().rolls).toEqual([ACERTO, BENCAO]);
    expect(store.getState().folders).toEqual([{ id: 'folder-1', name: 'Combate' }]);
  });

  it('a list asked before a confirmed create is asked again, so neither roll is lost', async () => {
    const api = new SavedRollsApiFake();
    api.rolls.set(VHARN.id, [ACERTO]);
    const store = createSavedRollsStore(api, VHARN.id);
    const releaseOldList = api.answers.hold('list');
    store.getState().load();

    await store.getState().create(ATAQUE);
    api.answers.clear('list');
    releaseOldList({ ok: true, value: [ACERTO] });
    await settled();

    expect(store.getState().rolls?.map((roll) => roll.id)).toEqual([
      ACERTO.id,
      CREATED_SAVED_ROLL_ID,
    ]);
  });

  it('a refused list keeps the failure and no rolls', async () => {
    const api = new SavedRollsApiFake();
    api.answers.answer('list', { ok: false, failure: { kind: 'offline' } });
    const store = createSavedRollsStore(api, VHARN.id);

    store.getState().load();
    await settled();

    expect(store.getState().loadFailure).toEqual({ kind: 'offline' });
    expect(store.getState().rolls).toBeNull();
  });

  it('removing a folder keeps its rolls, out of any folder', async () => {
    const api = new SavedRollsApiFake();
    api.rolls.set(VHARN.id, [{ ...ACERTO, folderId: 'folder-1' }, BENCAO]);
    api.folders.set(VHARN.id, [{ id: 'folder-1', name: 'Combate' }]);
    const store = createSavedRollsStore(api, VHARN.id);
    store.getState().load();
    await settled();

    await store.getState().removeFolder('folder-1');

    expect(store.getState().folders).toEqual([]);
    expect(store.getState().rolls).toEqual([ACERTO, BENCAO]);
  });

  it('a refused create leaves the list as it was', async () => {
    const api = new SavedRollsApiFake();
    api.rolls.set(VHARN.id, [ACERTO]);
    const store = createSavedRollsStore(api, VHARN.id);
    store.getState().load();
    await settled();
    api.answers.answer('create', { ok: false, failure: { kind: 'name_taken' } });

    const result = await store.getState().create(ATAQUE);

    expect(result).toEqual({ ok: false, failure: { kind: 'name_taken' } });
    expect(store.getState().rolls).toEqual([ACERTO]);
  });
});
