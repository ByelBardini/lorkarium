import { describe, expect, it } from 'vitest';
import { createSavedTokensStore } from '@/stores/saved-tokens-store';
import { VHARN } from '../support/campaigns-api-fake';
import {
  MORTOS_ID,
  SKELETON_ID,
  ZOMBIE_ID,
  skeletonSaved,
  zombieSaved,
} from '../support/saved-token-fixtures';
import { SavedTokensApiFake } from '../support/saved-tokens-api-fake';

const MORTOS = { id: MORTOS_ID, name: 'Mortos-vivos' };

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(api = new SavedTokensApiFake([zombieSaved(), skeletonSaved()], [MORTOS])) {
  return { api, store: createSavedTokensStore(api, VHARN.id) };
}

describe('createSavedTokensStore', () => {
  it('before load the list is null; load brings the tokens and the folders', async () => {
    const { store } = setup();

    expect(store.getState().savedTokens).toBeNull();
    store.getState().load();
    await settled();

    expect(store.getState().savedTokens?.map((saved) => saved.name)).toEqual([
      'Zumbi',
      'Esqueleto',
    ]);
    expect(store.getState().folders).toEqual([MORTOS]);
  });

  it('a failed list keeps the failure to show', async () => {
    const { api, store } = setup();
    api.failNext({ kind: 'offline' });

    store.getState().load();
    await settled();

    expect(store.getState().loadFailure).toEqual({ kind: 'offline' });
  });

  it('a save confirmed while the list is on its way is not lost: the old list is asked again', async () => {
    const { api, store } = setup(new SavedTokensApiFake([]));
    api.holdLists();
    store.getState().load();

    await store.getState().save({ name: 'Zumbi', token: zombieSaved().token });
    api.releaseLists();
    await settled();
    await settled();

    expect(store.getState().savedTokens?.map((saved) => saved.name)).toEqual(['Zumbi']);
    expect(api.calls.filter((call) => call === 'list')).toHaveLength(2);
  });

  it('save appends the confirmed entry; a refused one changes nothing and answers the failure', async () => {
    const { api, store } = setup();
    store.getState().load();
    await settled();

    await store.getState().save({ name: 'Lobo', token: zombieSaved().token });
    api.failNext({ kind: 'limit' });
    const refused = await store.getState().save({ name: 'Urso', token: zombieSaved().token });

    expect(store.getState().savedTokens?.map((saved) => saved.name)).toEqual([
      'Zumbi',
      'Esqueleto',
      'Lobo',
    ]);
    expect(refused).toEqual({ ok: false, failure: { kind: 'limit' } });
  });

  it('update swaps the entry by id and remove takes it out', async () => {
    const { store } = setup();
    store.getState().load();
    await settled();

    await store.getState().update(ZOMBIE_ID, { name: 'Zumbi velho' });
    await store.getState().remove(SKELETON_ID);

    expect(store.getState().savedTokens?.map((saved) => saved.name)).toEqual(['Zumbi velho']);
  });

  it('removing a folder leaves its tokens out of any folder', async () => {
    const { store } = setup();
    store.getState().load();
    await settled();

    await store.getState().removeFolder(MORTOS_ID);

    expect(store.getState().folders).toEqual([]);
    expect(
      store.getState().savedTokens?.find((saved) => saved.id === SKELETON_ID)?.folderId,
    ).toBeNull();
  });

  it('createFolder appends and renameFolder renames in place', async () => {
    const { store } = setup();
    store.getState().load();
    await settled();

    const pets = await store.getState().createFolder('Pets');
    await store.getState().renameFolder(MORTOS_ID, 'Mortos');

    expect(pets.ok).toBe(true);
    expect(store.getState().folders.map((folder) => folder.name)).toEqual(['Mortos', 'Pets']);
  });
});
