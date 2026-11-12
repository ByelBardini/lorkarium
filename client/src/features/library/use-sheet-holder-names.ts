import type { CampaignMemberDto, CharacterDto, TokenDto } from '@lorkarium/contracts';
import { useTokensBesidesPose } from '@/features/board/use-board-tokens';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { SheetHolderNames } from '@/features/sheets/sheet-messages';
import { createBoardStore } from '@/stores/board-store';
import type { CharactersStore } from '@/stores/characters-store';
import type { OpenTable } from '@/stores/open-tables-store';
import type { TablePresenceStore } from '@/stores/table-presence-store';

/** A player the master may give a sheet to: "Bia (Lyra)" in the menus. */
export type SheetPlayer = Readonly<{ userId: string; label: string }>;

/** The names the library says about sheet holders, from the table's members, its characters
 *  (each player's character's name) and its group grid (a token's name). */
export type SheetHolderDirectory = Readonly<{ names: SheetHolderNames; players: SheetPlayer[] }>;

type SheetHolderMember = Pick<CampaignMemberDto, 'userId' | 'name' | 'role'>;

/** Who holds the library's sheets, as this reader knows them; follows the live roster (a player
 *  who joined after the room opened is not in the loader's `members`), the characters and the
 *  grid. `members` only counts until the table's first presence snapshot.
 *
 *  Example: `const { names, players } = useSheetHolderNames(campaign.members, tableView.table)` */
export function useSheetHolderNames(
  members: readonly CampaignMemberDto[],
  table: OpenTable | null,
): SheetHolderDirectory {
  const live = useLiveMembersOf(table?.presence ?? null);
  const tokens = useTokensBesidesPose(table?.board ?? NO_BOARD);
  const characters = useCharactersOf(table?.characters ?? null);
  const roster = live ?? members;
  return useMemo(() => directoryOf(roster, characters, tokens), [roster, characters, tokens]);
}

// `null` until the first snapshot: before it the presence store has no members at all.
function useLiveMembersOf(
  store: StoreApi<TablePresenceStore> | null,
): readonly SheetHolderMember[] | null {
  const subscribe = useCallback(
    (onChange: () => void) => store?.subscribe(onChange) ?? (() => undefined),
    [store],
  );
  return useSyncExternalStore(subscribe, () => {
    const state = store?.getState();
    return state && state.version !== null ? state.members : null;
  });
}

const NO_CHARACTERS: readonly CharacterDto[] = [];

// No table open: an empty board keeps the hook's call unconditional.
const NO_BOARD = createBoardStore('', () => undefined);

function useCharactersOf(store: StoreApi<CharactersStore> | null): readonly CharacterDto[] {
  const subscribe = useCallback(
    (onChange: () => void) => store?.subscribe(onChange) ?? (() => undefined),
    [store],
  );
  return useSyncExternalStore(subscribe, () => store?.getState().characters ?? NO_CHARACTERS);
}

function directoryOf(
  members: readonly SheetHolderMember[],
  characters: readonly CharacterDto[],
  tokens: readonly TokenDto[],
): SheetHolderDirectory {
  const names: SheetHolderNames = {
    memberName: (userId) => members.find((member) => member.userId === userId)?.name ?? null,
    characterName: (userId) =>
      characters.find((character) => character.userId === userId)?.name ?? null,
    tokenName: (tokenId) => tokens.find((token) => token.id === tokenId)?.name ?? null,
  };
  const players = members
    .filter((member) => member.role === 'player')
    .map((member) => ({ userId: member.userId, label: playerLabelOf(member, names) }));
  return { names, players };
}

function playerLabelOf(member: SheetHolderMember, names: SheetHolderNames): string {
  const character = names.characterName(member.userId);
  return character === null ? member.name : `${member.name} (${character})`;
}
