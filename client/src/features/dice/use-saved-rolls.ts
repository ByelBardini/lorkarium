import { useEffect } from 'react';
import type { SavedRollsApi } from '@/services/saved-rolls-api';
import {
  savedRollsStoreOf,
  useSavedRollsStore,
  type SavedRollsStore,
} from '@/stores/saved-rolls-store';

export type SavedRollsView = Omit<SavedRollsStore, 'load'>;

/** The viewer's saved rolls at one table, shared by every screen that shows them (the "Dados"
 *  tab and the chat composer): listed again on each mount, then kept by each change the server
 *  confirmed, wherever it was made.
 *
 *  Example: `const saved = useSavedRolls(campaignId, deps.savedRolls); await saved.create({ name, parts })` */
export function useSavedRolls(campaignId: string, api: SavedRollsApi): SavedRollsView {
  const store = savedRollsStoreOf(api, campaignId);
  useEffect(() => store.getState().load(), [store]);
  return useSavedRollsStore(store, (state) => state);
}
