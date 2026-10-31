import { describe, expect, it } from 'vitest';
import type { DocumentsResult } from '@/services/documents-api';
import {
  createVersionedDraftStore,
  type VersionedDraftSource,
  type VersionedWrite,
} from '@/stores/versioned-draft-store';
import { InteractionClockFake } from '../support/interaction-clock-fake';

type Note = Readonly<{ text: string; version: number }>;
type NoteDraft = Readonly<{ text: string }>;
/** One versioned note kept in memory, standing in for a document or a tab. */
class NoteSourceFake implements VersionedDraftSource<Note, NoteDraft> {
  note: Note = { text: 'A', version: 0 };
  saved: number[] = [];
  read = async (): Promise<DocumentsResult<Note>> => ({ ok: true, value: this.note });
  save = async (
    draft: NoteDraft,
    _actionId: string,
    expectedVersion: number,
  ): Promise<DocumentsResult<VersionedWrite<Note>>> => {
    this.saved.push(expectedVersion);
    this.note = { text: draft.text, version: expectedVersion + 1 };
    return { ok: true, value: { remote: this.note, receiptVersion: this.note.version } };
  };
  draftOf = (note: Note): NoteDraft => ({ text: note.text });
  versionOf = (note: Note): number => note.version;
  canEdit = (): boolean => true;
}
async function setup() {
  const source = new NoteSourceFake();
  const store = createVersionedDraftStore({
    source,
    clock: new InteractionClockFake(),
    newActionId: () => '10000000-0000-4000-8000-000000000002',
  });
  await store.getState().load();
  return { source, store };
}
describe('a draft adopting a copy written by another command', () => {
  it('a clean draft takes the adopted copy', async () => {
    const { store } = await setup();
    store.getState().adopt({ text: 'B', version: 4 });
    expect(store.getState()).toMatchObject({ draft: { text: 'B' }, status: 'saved' });
  });
  it('a dirty draft stays, and its save goes against the adopted version', async () => {
    const { source, store } = await setup();
    store.getState().edit({ text: 'Meu' });
    store.getState().adopt({ text: 'A', version: 4 });
    expect(store.getState().draft).toEqual({ text: 'Meu' });
    await store.getState().flush();
    expect(source.saved).toEqual([4]);
    expect(store.getState().status).toBe('saved');
  });
  it('a disposed draft ignores the adopted copy', async () => {
    const { store } = await setup();
    store.getState().dispose();
    store.getState().adopt({ text: 'B', version: 4 });
    expect(store.getState().confirmed).toBeNull();
  });
});
