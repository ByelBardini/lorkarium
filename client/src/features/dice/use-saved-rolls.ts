import type {
  CreateSavedRollRequestDto,
  SavedRollDto,
  SavedRollFolderDto,
} from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import type {
  SavedRollsApi,
  SavedRollsFailure,
  SavedRollsResult,
} from '@/services/saved-rolls-api';

export type SavedRollsView = Readonly<{
  /** `null` while the first list is on its way. */
  rolls: readonly SavedRollDto[] | null;
  /** Empty until the folders arrive: the rolls show meanwhile, out of any folder they are in. */
  folders: readonly SavedRollFolderDto[];
  loadFailure: SavedRollsFailure | null;
  create: (input: CreateSavedRollRequestDto) => Promise<SavedRollsResult<SavedRollDto>>;
  remove: (savedRollId: string) => Promise<SavedRollsResult<null>>;
  /** Puts the roll in a folder; `null` takes it out of any. */
  move: (savedRollId: string, folderId: string | null) => Promise<SavedRollsResult<SavedRollDto>>;
  createFolder: (name: string) => Promise<SavedRollsResult<SavedRollFolderDto>>;
  renameFolder: (folderId: string, name: string) => Promise<SavedRollsResult<SavedRollFolderDto>>;
  /** Deletes the folder; its rolls stay, out of any folder (the server's rule). */
  removeFolder: (folderId: string) => Promise<SavedRollsResult<null>>;
}>;

/** The viewer's saved rolls at one table: listed once, then kept by each create and remove the
 *  server confirmed (the list is only the owner's, so nobody else changes it).
 *
 *  Example: `const saved = useSavedRolls(campaignId, deps.savedRolls); await saved.create({ name, parts })` */
export function useSavedRolls(campaignId: string, api: SavedRollsApi): SavedRollsView {
  const [rolls, setRolls] = useState<readonly SavedRollDto[] | null>(null);
  const [folders, setFolders] = useState<readonly SavedRollFolderDto[]>([]);
  const [loadFailure, setLoadFailure] = useState<SavedRollsFailure | null>(null);
  useEffect(() => {
    let live = true;
    void api.list(campaignId).then((result) => {
      if (!live) return;
      if (result.ok) setRolls(result.value);
      else setLoadFailure(result.failure);
    });
    void api.listFolders(campaignId).then((result) => {
      if (!live) return;
      if (result.ok) setFolders(result.value);
      else setLoadFailure(result.failure);
    });
    return () => {
      live = false;
    };
  }, [campaignId, api]);
  const create = async (input: CreateSavedRollRequestDto) => {
    const result = await api.create(campaignId, input);
    if (result.ok) setRolls((kept) => [...(kept ?? []), result.value]);
    return result;
  };
  const remove = async (savedRollId: string) => {
    const result = await api.remove(campaignId, savedRollId);
    if (result.ok) setRolls((kept) => (kept ?? []).filter((roll) => roll.id !== savedRollId));
    return result;
  };
  const move = async (savedRollId: string, folderId: string | null) => {
    const result = await api.update(campaignId, savedRollId, { folderId });
    if (result.ok) {
      const moved = result.value;
      setRolls((kept) => (kept ?? []).map((roll) => (roll.id === moved.id ? moved : roll)));
    }
    return result;
  };
  const createFolder = async (name: string) => {
    const result = await api.createFolder(campaignId, name);
    if (result.ok) setFolders((kept) => [...kept, result.value]);
    return result;
  };
  const renameFolder = async (folderId: string, name: string) => {
    const result = await api.renameFolder(campaignId, folderId, name);
    if (result.ok) {
      const renamed = result.value;
      setFolders((kept) => kept.map((folder) => (folder.id === folderId ? renamed : folder)));
    }
    return result;
  };
  const removeFolder = async (folderId: string) => {
    const result = await api.removeFolder(campaignId, folderId);
    if (!result.ok) return result;
    setFolders((kept) => kept.filter((folder) => folder.id !== folderId));
    setRolls((kept) => (kept ?? []).map((roll) => releasedRollOf(roll, folderId)));
    return result;
  };
  const folderActions = { createFolder, renameFolder, removeFolder };
  return { rolls, folders, loadFailure, create, remove, move, ...folderActions };
}

function releasedRollOf(roll: SavedRollDto, folderId: string): SavedRollDto {
  return roll.folderId === folderId ? { ...roll, folderId: null } : roll;
}
