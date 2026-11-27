import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { carriesSavedToken, savedTokenIdOf } from '@/lib/saved-token-drag';
import type { SavedTokensResult } from '@/services/saved-tokens-api';
import type { SavedTokensStore } from '@/stores/saved-tokens-store';

export type FolderDrop = Readonly<{
  /** A saved token is dragged over it: the group lights up. */
  over: boolean;
  handlers: Readonly<{
    onDragEnter: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    onDragLeave: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
  }>;
}>;

/** A group of the list as a drop target: a saved token dragged from the list and dropped on it
 *  moves into `folderId` (`null`: out of any folder); one already there sends nothing.
 *
 *  Example: `const drop = useFolderDrop(list, folder.id, onProblem); <ul {...drop.handlers}>` */
export function useFolderDrop(
  list: StoreApi<SavedTokensStore>,
  folderId: string | null,
  onProblem: (result: SavedTokensResult<null>) => void,
): FolderDrop {
  const [over, setOver] = useState(false);
  const onDragOver = (event: React.DragEvent): void => {
    if (!carriesSavedToken(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOver(true);
  };
  const onDragLeave = (event: React.DragEvent): void => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOver(false);
  };
  const onDrop = (event: React.DragEvent): void => {
    setOver(false);
    const savedTokenId = savedTokenIdOf(event.dataTransfer);
    if (!savedTokenId) return;
    event.preventDefault();
    void moveInto(list, savedTokenId, folderId).then(onProblem);
  };
  // The enter takes the drop too: a quick release lands before any dragover reached the group.
  return { over, handlers: { onDragEnter: onDragOver, onDragOver, onDragLeave, onDrop } };
}

async function moveInto(
  list: StoreApi<SavedTokensStore>,
  savedTokenId: string,
  folderId: string | null,
): Promise<SavedTokensResult<null>> {
  const saved = list.getState().savedTokens?.find(({ id }) => id === savedTokenId);
  if (!saved || saved.folderId === folderId) return { ok: true, value: null };
  const result = await list.getState().update(savedTokenId, { folderId });
  return result.ok ? { ok: true, value: null } : result;
}
