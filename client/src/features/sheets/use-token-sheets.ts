import type { SheetSummaryDto, SheetTemplateSummaryDto, TokenDto } from '@lorkarium/contracts';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { SheetRoom } from './sheet-room-context';

/** The sheets of one holder this reader may read, in order of creation (the server leaves out
 *  the ones they may not). */
export type TokenSheets =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; sheets: readonly SheetSummaryDto[] }>;

/** Whose sheets to read: a free token's, or a character's (a linked token's are its character's). */
export type SheetsOwner = Readonly<{ tokenId: string }> | Readonly<{ characterId: string }>;

const LOADING: TokenSheets = { status: 'loading' };
const NONE: TokenSheets = { status: 'ready', sheets: [] };

/** The owner whose sheets a token's menu shows: its character when linked, else the token.
 *
 *  Example: `sheetsOwnerOf(linkedLyra) // { characterId: LYRA_CHARACTER_ID }` */
export function sheetsOwnerOf(token: Pick<TokenDto, 'id' | 'characterId'>): SheetsOwner {
  return token.characterId ? { characterId: token.characterId } : { tokenId: token.id };
}

/** Reads the sheets of `owner` and reads them again at each `sheet:changed` of the table: a
 *  sheet made, given, taken, renamed or made private shows at once. `null` has none, and nothing
 *  is read.
 *
 *  Example: `const sheets = useTokenSheets(room, sheetsOwnerOf(token))` */
export function useTokenSheets(room: SheetRoom | null, owner: SheetsOwner | null): TokenSheets {
  const [read, setRead] = useState<Readonly<{ key: string; sheets: TokenSheets }> | null>(null);
  const change = useSheetChangesOf(room);
  const kind = owner && ('tokenId' in owner ? 'token' : 'character');
  const id = owner && ('tokenId' in owner ? owner.tokenId : owner.characterId);
  useEffect(() => {
    if (!room || !kind || !id) return;
    let current = true;
    void sheetsOf(room, kind, id).then((result) => {
      if (!current) return;
      const sheets: TokenSheets = result.ok ? { status: 'ready', sheets: result.value } : NONE;
      setRead({ key: `${kind}:${id}`, sheets });
    });
    return () => {
      current = false;
    };
  }, [room, kind, id, change]);
  if (!kind || !id) return NONE;
  return read?.key === `${kind}:${id}` ? read.sheets : LOADING;
}

type SheetsAnswer = Awaited<ReturnType<SheetRoom['sheetsApi']['ofToken']>>;

function sheetsOf(room: SheetRoom, kind: 'token' | 'character', id: string): Promise<SheetsAnswer> {
  const campaignId = room.campaign.id;
  if (kind === 'token') return room.sheetsApi.ofToken(campaignId, id);
  return room.sheetsApi.ofCharacter(campaignId, id);
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

// Nobody holds it: no token, no character (a character's sheet names its player).
function isSpare({ tokenId, memberId }: SheetSummaryDto): boolean {
  return tokenId === null && memberId === null;
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
      const spareSheets = (result.value.sheets ?? []).filter(isSpare);
      setLibrary({ templates: result.value.sheetTemplates ?? [], spareSheets });
    });
    return () => {
      current = false;
    };
  }, [room]);
  return library;
}
