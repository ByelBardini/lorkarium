import type { CharacterDto } from '@lorkarium/contracts';
import { useCallback, useSyncExternalStore } from 'react';
import { characterOfUser } from '@/stores/characters-store';
import { sheetWorkspaceKey, useDocumentWorkspaceSlice } from '@/stores/document-workspace-store';
import { useSheetRoom, type SheetRoom } from './sheet-room-context';
import { mainSheetOf } from './use-character-sheets';
import { useRoomTable, useTokenSheets } from './use-token-sheets';

/** The viewer's main sheet, the second home of the table beside the main map. */
export type ViewerMainSheet = Readonly<{
  /** Whose sheet it is: "Abrir a ficha de Lyra". */
  characterName: string;
  /** Its workspace key: the strip draws no tab for it, the button plays that tab. */
  key: string;
  /** It is what the room shows now. */
  shown: boolean;
  open: () => void;
}>;

/** The main sheet of the viewer's character (the only one stands in when none is chosen), read
 *  again at each `sheet:changed`; `null` outside a room, for whoever has no character (a master, a
 *  spectator) and while there is no sheet the viewer may read.
 *
 *  Example: `const mainSheet = useViewerMainSheet(session.user.id)` */
export function useViewerMainSheet(viewerId: string | null): ViewerMainSheet | null {
  const room = useSheetRoom();
  const character = useViewerCharacter(room, viewerId);
  const read = useTokenSheets(room, character && { characterId: character.id });
  const ready = read.status === 'ready' ? read.sheets : [];
  const main = character ? mainSheetOf(ready, character.mainSheetId) : undefined;
  const key = room && main ? sheetWorkspaceKey(room.campaign.id, main.id) : null;
  const shown = useDocumentWorkspaceSlice(
    room?.workspace,
    (state) => key !== null && state.activeByCampaign[room?.campaign.id ?? ''] === key,
    false,
  );
  if (!room || !character || !main || !key) return null;
  return { characterName: character.name, key, shown, open: () => room.actions.open(main) };
}

function useViewerCharacter(room: SheetRoom | null, viewerId: string | null): CharacterDto | null {
  const store = useRoomTable(room)?.characters;
  const subscribe = useCallback(
    (onChange: () => void) => store?.subscribe(onChange) ?? (() => undefined),
    [store],
  );
  return useSyncExternalStore(subscribe, () =>
    store && viewerId ? characterOfUser(store.getState().characters, viewerId) : null,
  );
}
