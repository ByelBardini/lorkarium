import type { CreateSavedRollRequestDto, SavedRollDto } from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import type {
  SavedRollsApi,
  SavedRollsFailure,
  SavedRollsResult,
} from '@/services/saved-rolls-api';

export type SavedRollsView = Readonly<{
  /** `null` while the first list is on its way. */
  rolls: readonly SavedRollDto[] | null;
  loadFailure: SavedRollsFailure | null;
  create: (input: CreateSavedRollRequestDto) => Promise<SavedRollsResult<SavedRollDto>>;
  remove: (savedRollId: string) => Promise<SavedRollsResult<null>>;
}>;

/** The viewer's saved rolls at one table: listed once, then kept by each create and remove the
 *  server confirmed (the list is only the owner's, so nobody else changes it).
 *
 *  Example: `const saved = useSavedRolls(campaignId, deps.savedRolls); await saved.create({ name, parts })` */
export function useSavedRolls(campaignId: string, api: SavedRollsApi): SavedRollsView {
  const [rolls, setRolls] = useState<readonly SavedRollDto[] | null>(null);
  const [loadFailure, setLoadFailure] = useState<SavedRollsFailure | null>(null);
  useEffect(() => {
    let live = true;
    void api.list(campaignId).then((result) => {
      if (!live) return;
      if (result.ok) setRolls(result.value);
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
  return { rolls, loadFailure, create, remove };
}
