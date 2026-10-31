import type { BoardStateDto, CampaignMemberDto } from '@lorkarium/contracts';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { SheetHolderNames } from '@/features/sheets/sheet-messages';
import type { BoardStore } from '@/stores/board-store';
import type { OpenTable } from '@/stores/open-tables-store';

/** A player the master may give a sheet to: "Bia (Lyra)" in the menus. */
export type SheetPlayer = Readonly<{ userId: string; label: string }>;

/** The names the library says about sheet holders, from the table's members, its cast (the
 *  characters' names and anchors) and its group grid (a loose token's name). */
export type SheetHolderDirectory = Readonly<{ names: SheetHolderNames; players: SheetPlayer[] }>;

/** Who holds the library's sheets, as this reader knows them; follows the cast and the grid.
 *
 *  Example: `const { names, players } = useSheetHolderNames(campaign.members, tableView.table)` */
export function useSheetHolderNames(
  members: readonly CampaignMemberDto[],
  table: OpenTable | null,
): SheetHolderDirectory {
  const cast = useBoardOf(table?.cast ?? null);
  const grid = useBoardOf(table?.board ?? null);
  return useMemo(() => directoryOf(members, cast, grid), [members, cast, grid]);
}

function useBoardOf(store: StoreApi<BoardStore> | null): BoardStateDto | null {
  const subscribe = useCallback(
    (onChange: () => void) => store?.subscribe(onChange) ?? (() => undefined),
    [store],
  );
  return useSyncExternalStore(subscribe, () => store?.getState().board ?? null);
}

function directoryOf(
  members: readonly CampaignMemberDto[],
  cast: BoardStateDto | null,
  grid: BoardStateDto | null,
): SheetHolderDirectory {
  const tokens = [...(cast?.tokens ?? []), ...(grid?.tokens ?? [])];
  const names: SheetHolderNames = {
    memberName: (userId) => members.find((member) => member.userId === userId)?.name ?? null,
    characterName: (userId) =>
      cast?.memberCards.find((card) => card.userId === userId)?.characterName ?? null,
    tokenName: (tokenId) => tokens.find((token) => token.id === tokenId)?.name ?? null,
  };
  const players = members
    .filter((member) => member.role === 'player')
    .map((member) => ({ userId: member.userId, label: playerLabelOf(member, names) }));
  return { names, players };
}

function playerLabelOf(member: CampaignMemberDto, names: SheetHolderNames): string {
  const character = names.characterName(member.userId);
  return character === null ? member.name : `${member.name} (${character})`;
}
