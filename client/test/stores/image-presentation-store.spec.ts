import { describe, expect, it } from 'vitest';
import { createImagePresentationStore } from '@/stores/image-presentation-store';
import type { ImagePresentationApi } from '@/services/image-presentation-api';
import type { ImagePresentationStateDto } from '@lorkarium/contracts';
import type { LibraryResult } from '@/services/library-api';
import { ImagePresentationApiFake } from '../support/image-presentation-api-fake';
import { imagePresentation } from '../support/image-presentation-fixtures';
import { StorageFake } from '../support/storage-fake';

class DelayedPresentationApi implements ImagePresentationApi {
  private finish!: (value: LibraryResult<ImagePresentationStateDto>) => void;
  private readonly pending = new Promise<LibraryResult<ImagePresentationStateDto>>((resolve) => {
    this.finish = resolve;
  });
  snapshot(): Promise<LibraryResult<ImagePresentationStateDto>> {
    return this.pending;
  }
  present(): Promise<LibraryResult<ImagePresentationStateDto>> {
    return this.pending;
  }
  release(snapshot: ImagePresentationStateDto): void {
    this.finish({ ok: true, value: snapshot });
  }
}

function presentationStore(
  storage = new StorageFake(),
  userId = 'ana',
  api: ImagePresentationApi = new ImagePresentationApiFake(),
) {
  const store = createImagePresentationStore({
    campaignId: imagePresentation().campaignId,
    userId,
    storage,
    api,
  });
  store.getState().setViewing(true);
  return store;
}

describe('image presentation reconciliation', () => {
  it('joining a room suppresses its existing presentation but a subsequent live show opens', async () => {
    const api = new ImagePresentationApiFake();
    api.answer = { ok: true, value: imagePresentation() };
    const store = presentationStore(new StorageFake(), 'ana', api);
    await store.getState().sync();
    expect(store.getState().dismissed).toBe(true);
    store.getState().apply(
      imagePresentation({
        version: 2,
        presentation: { ...imagePresentation().presentation!, id: 'new-show' },
      }),
    );
    expect(store.getState().dismissed).toBe(false);
  });
  it('a presentation received outside the room never opens when returning, but the next live show does', () => {
    const store = presentationStore();
    store.getState().apply(imagePresentation());
    store.getState().setViewing(false);
    store.getState().apply(
      imagePresentation({
        version: 2,
        presentation: { ...imagePresentation().presentation!, id: 'while-away' },
      }),
    );
    expect(store.getState().dismissed).toBe(true);
    store.getState().setViewing(true);
    expect(store.getState().dismissed).toBe(true);
    store.getState().apply(
      imagePresentation({
        version: 3,
        presentation: { ...imagePresentation().presentation!, id: 'live-show' },
      }),
    );
    expect(store.getState().dismissed).toBe(false);
  });
  it('reconnection while viewing still recovers a newer presentation', async () => {
    const api = new ImagePresentationApiFake();
    const store = presentationStore(new StorageFake(), 'ana', api);
    await store.getState().sync();
    api.answer = { ok: true, value: imagePresentation({ version: 3 }) };
    await store.getState().sync();
    expect(store.getState().dismissed).toBe(false);
  });
  it('event version 3 survives a slow recovery of version 2', async () => {
    const api = new DelayedPresentationApi();
    const store = presentationStore(new StorageFake(), 'ana', api);
    const recovery = store.getState().sync();
    store.getState().apply(imagePresentation({ version: 3 }));
    api.release(imagePresentation({ version: 2, presentation: null }));
    await recovery;
    expect(store.getState().version).toBe(3);
    expect(store.getState().presentation?.name).toBe('Retrato');
  });

  it('dismissal survives F5, duplicates and reconnection; a new ID reopens the same image', async () => {
    const storage = new StorageFake();
    const first = presentationStore(storage);
    first.getState().apply(imagePresentation());
    first.getState().dismiss();
    first.getState().apply(imagePresentation());
    expect(first.getState().dismissed).toBe(true);
    const reload = presentationStore(storage);
    reload.getState().apply(imagePresentation());
    expect(reload.getState().dismissed).toBe(true);
    const next = imagePresentation();
    if (!next.presentation) throw new Error('fixture missing presentation');
    reload.getState().apply({
      ...next,
      version: 2,
      presentation: { ...next.presentation, id: 'another-presentation' },
    });
    expect(reload.getState().dismissed).toBe(false);
    expect(reload.getState().presentation?.imageId).toBe(next.presentation.imageId);
  });

  it('another user and invalid storage never inherit a dismissal', () => {
    const storage = new StorageFake();
    const first = presentationStore(storage);
    first.getState().apply(imagePresentation());
    first.getState().dismiss();
    const other = presentationStore(storage, 'bia');
    other.getState().apply(imagePresentation());
    expect(other.getState().dismissed).toBe(false);
    storage.values.set(
      'lorkarium.imagePresentation.bia.' + imagePresentation().campaignId,
      '{broken',
    );
    const invalid = presentationStore(storage, 'bia');
    invalid.getState().apply(imagePresentation());
    expect(invalid.getState().dismissed).toBe(false);
  });

  it('foreign campaign and older events cannot clear the current presentation', () => {
    const store = presentationStore();
    store.getState().apply(imagePresentation({ version: 3 }));
    store
      .getState()
      .apply(imagePresentation({ campaignId: 'another-campaign', version: 9, presentation: null }));
    store.getState().apply(imagePresentation({ version: 2, presentation: null }));
    expect(store.getState().version).toBe(3);
    expect(store.getState().presentation?.name).toBe('Retrato');
    store.getState().apply(imagePresentation({ version: 4, presentation: null }));
    expect(store.getState().presentation).toBeNull();
  });

  it('offline recovery exposes an error and the next join can retry', async () => {
    const api = new ImagePresentationApiFake();
    api.answer = { ok: false, failure: { kind: 'offline' } };
    const store = presentationStore(new StorageFake(), 'ana', api);
    await store.getState().sync();
    expect(store.getState().failure?.kind).toBe('offline');
    api.answer = { ok: true, value: imagePresentation() };
    await store.getState().sync();
    expect(store.getState().failure).toBeNull();
    expect(store.getState().presentation?.name).toBe('Retrato');
  });

  it('logout removes content and ignores a recovery arriving afterward', async () => {
    const api = new DelayedPresentationApi();
    const storage = new StorageFake();
    const store = presentationStore(storage, 'ana', api);
    const recovery = store.getState().sync();
    store.getState().clear();
    api.release(imagePresentation());
    await recovery;
    expect(store.getState().presentation).toBeNull();
    expect(storage.values.size).toBe(0);
  });
});
