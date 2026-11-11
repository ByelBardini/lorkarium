import type { SheetSummaryDto } from '@lorkarium/contracts';
import { useSheetRoom, type SheetRoom } from './sheet-room-context';
import { useTokenSheets } from './use-token-sheets';

/** The sheets of a character the reader may read, with the room that opens them. */
export type CharacterSheets = Readonly<{ room: SheetRoom; sheets: readonly SheetSummaryDto[] }>;

/** Reads the sheets of a character for its "Na mesa" card (again at each `sheet:changed`);
 *  `null` outside a sheet room or while reading.
 *
 *  Example: `const found = useCharacterSheets(lyra.id)` */
export function useCharacterSheets(characterId: string): CharacterSheets | null {
  const room = useSheetRoom();
  const read = useTokenSheets(room, { characterId });
  if (!room || read.status === 'loading') return null;
  return { room, sheets: read.sheets };
}

/** The main sheet when the reader may read it; with no main, the only sheet stands in.
 *
 *  Example: `mainSheetOf([lyra, spells], spells.id) // spells` */
export function mainSheetOf(
  sheets: readonly SheetSummaryDto[],
  mainSheetId: string | null,
): SheetSummaryDto | undefined {
  const main = sheets.find(({ id }) => id === mainSheetId);
  if (main) return main;
  return sheets.length === 1 ? sheets[0] : undefined;
}

/** Opens the character's main sheet (see `mainSheetOf`); `null` when there is none to open.
 *
 *  Example: `const openMain = mainSheetOpener(found, lyra.mainSheetId)` */
export function mainSheetOpener(
  found: CharacterSheets | null,
  mainSheetId: string | null,
): (() => void) | null {
  const main = found && mainSheetOf(found.sheets, mainSheetId);
  if (!found || !main) return null;
  return () => found.room.actions.open(main);
}
