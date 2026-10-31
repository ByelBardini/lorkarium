import type {
  CampaignDetailDto,
  SheetHolderDto,
  SheetSummaryDto,
  SheetVisibilityDto,
} from '@lorkarium/contracts';
import { createContext, useContext } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { LibraryApi } from '@/services/library-api';
import type { SheetsApi } from '@/services/sheets-api';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import type { OpenTablesStore } from '@/stores/open-tables-store';

/** What the room gives the token menu and the "Na mesa" card to open and link sheets. */
export type SheetRoomServices = Readonly<{
  sheetsApi: SheetsApi;
  libraryApi: Pick<LibraryApi, 'list'>;
  workspace: StoreApi<DocumentWorkspaceStore>;
  openTables: StoreApi<OpenTablesStore>;
  newActionId?: () => string;
}>;

/** A sheet the master makes from a menu: of `templateId`, held by `holder`. */
export type NewRoomSheet = Readonly<{ templateId: string; name: string; holder: SheetHolderDto }>;

/** The sheet commands of one table; refusals are said by the provider. */
export type SheetRoomActions = Readonly<{
  open: (sheet: Pick<SheetSummaryDto, 'id' | 'name'>) => void;
  /** The master's "Nova ficha": the server puts it on the anchor of a character's token, and
   *  makes the anchor of a player who has none. Opens it once made. */
  create: (sheet: NewRoomSheet) => void;
  setVisibility: (sheet: SheetSummaryDto, visibility: SheetVisibilityDto) => void;
  /** Gives the sheet to `holder`; `null` takes it from whoever holds it. */
  give: (sheet: SheetSummaryDto, holder: SheetHolderDto | null) => void;
}>;

export type SheetRoom = SheetRoomServices &
  Readonly<{ campaign: CampaignDetailDto; actions: SheetRoomActions }>;

/** Where `SheetRoomProvider` puts the table's sheets. */
export const SheetRoomContext = createContext<SheetRoom | null>(null);

/** The table's sheets for whoever is under it; `null` outside a room (no sheet item there).
 *
 *  Example: `const room = useSheetRoom(); room?.actions.open(sheet)` */
export function useSheetRoom(): SheetRoom | null {
  return useContext(SheetRoomContext);
}
