import type { SheetSummaryDto, SheetTemplateSummaryDto } from '@lorkarium/contracts';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { SheetRoom } from './sheet-room-context';

/** The sheets of one token this reader may read, in order of creation (the server leaves out the
 *  ones they may not). */
export type TokenSheets =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; sheets: readonly SheetSummaryDto[] }>;

const LOADING: TokenSheets = { status: 'loading' };
const NONE: TokenSheets = { status: 'ready', sheets: [] };

/** Reads the sheets of `tokenId` (the anchor for a character's token) and reads them again at
 *  each `sheet:changed` of the table: a sheet made, given, taken, renamed or made private shows
 *  at once. `null` (a player with no character yet) has none, and nothing is read.
 *
 *  Example: `const sheets = useTokenSheets(room, token.anchorTokenId ?? token.id)` */
export function useTokenSheets(room: SheetRoom | null, tokenId: string | null): TokenSheets {
  const [read, setRead] = useState<Readonly<{ tokenId: string; sheets: TokenSheets }> | null>(null);
  const change = useSheetChangesOf(room);
  useEffect(() => {
    if (!room || tokenId === null) return;
    let current = true;
    void room.sheetsApi.ofToken(room.campaign.id, tokenId).then((result) => {
      if (!current) return;
      setRead({ tokenId, sheets: result.ok ? { status: 'ready', sheets: result.value } : NONE });
    });
    return () => {
      current = false;
    };
  }, [room, tokenId, change]);
  if (tokenId === null) return NONE;
  return read?.tokenId === tokenId ? read.sheets : LOADING;
}

// The last `sheet:changed` of the room's table (a new object per event), or `null`.
function useSheetChangesOf(room: SheetRoom | null): unknown {
  const openTables = room?.openTables ?? null;
  const campaignId = room?.campaign.id;
  const subscribeTables = useCallback(
    (onChange: () => void) => openTables?.subscribe(onChange) ?? (() => undefined),
    [openTables],
  );
  const tabs = useSyncExternalStore(
    subscribeTables,
    () => openTables?.getState().tables.find((table) => table.campaignId === campaignId)?.tabs,
  );
  const subscribe = useCallback(
    (onChange: () => void) => tabs?.subscribe(onChange) ?? (() => undefined),
    [tabs],
  );
  return useSyncExternalStore(subscribe, () => tabs?.getState().sheetChange ?? null);
}

/** What the master's "Nova ficha ▸" and "Dar ficha existente ▸" offer: the templates and the
 *  sheets nobody holds. */
export type SheetLibrary = Readonly<{
  templates: readonly SheetTemplateSummaryDto[];
  spareSheets: readonly SheetSummaryDto[];
}>;

const EMPTY_LIBRARY: SheetLibrary = { templates: [], spareSheets: [] };

/** The master's templates and spare sheets, read from the library when asked (a submenu
 *  opening); `null` while reading.
 *
 *  Example: `const library = useSheetLibrary(room)` */
export function useSheetLibrary(room: SheetRoom | null): SheetLibrary | null {
  const [library, setLibrary] = useState<SheetLibrary | null>(null);
  useEffect(() => {
    if (!room) return;
    let current = true;
    void room.libraryApi.list(room.campaign.id).then((result) => {
      if (!current) return;
      if (!result.ok) return setLibrary(EMPTY_LIBRARY);
      const spareSheets = (result.value.sheets ?? []).filter(({ tokenId }) => tokenId === null);
      setLibrary({ templates: result.value.sheetTemplates ?? [], spareSheets });
    });
    return () => {
      current = false;
    };
  }, [room]);
  return library;
}
