import { describe, expect, it } from 'vitest';
import { boardTokenSource, characterSource } from '@/sheet-sandbox/sheet-token-source';
import { createBoardStore } from '@/stores/board-store';
import { createCharactersStore } from '@/stores/characters-store';
import { VHARN } from '../support/campaigns-api-fake';
import {
  characterChangedAt,
  charactersSynced,
  kaelCharacter,
  lyraCharacter,
  syncedCharacters,
} from '../support/character-fixtures';
import {
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  LYRA_ID,
  lyra,
  vharnBoard,
} from '../support/table-session-fixtures';

function gridWithLyra() {
  const grid = createBoardStore(VHARN.id, () => undefined);
  grid.getState().apply({ kind: 'board', state: vharnBoard({ tokens: [lyra()] }) });
  return grid;
}

describe('boardTokenSource', () => {
  it('reads the token of the board store by its id', () => {
    const source = boardTokenSource(gridWithLyra(), LYRA_ID);
    expect(source.current()).toEqual(lyra());
  });

  it('a token the store does not have (or a store still loading) is null', () => {
    const loading = createBoardStore(VHARN.id, () => undefined);
    const missing = boardTokenSource(gridWithLyra(), '0f0e0d0c-0b0a-4908-8706-050403020100');
    expect([boardTokenSource(loading, LYRA_ID).current(), missing.current()]).toEqual([null, null]);
  });

  it('tells its listener when the store changes, until unsubscribed', () => {
    const grid = gridWithLyra();
    const heard: string[] = [];
    const unsubscribe = boardTokenSource(grid, LYRA_ID).subscribe(() => heard.push('change'));
    grid.getState().apply({ kind: 'board', state: vharnBoard({ version: 4 }) });
    unsubscribe();
    grid.getState().apply({ kind: 'board', state: vharnBoard({ version: 5 }) });
    expect(heard).toEqual(['change']);
  });
});

describe('characterSource', () => {
  it("reads the character of the sheet's player, and the same object while it did not change", () => {
    const characters = syncedCharacters();
    const source = characterSource(characters, CAIO_AT_TABLE.userId);
    const first = source.current();
    characters.getState().apply(characterChangedAt(4, lyraCharacter({ armorClass: 18 })));
    expect(first).toEqual(kaelCharacter());
    expect(source.current()).toBe(first);
  });

  it('before the first sync, or for a player whose character this viewer does not see, is null', () => {
    const loading = createCharactersStore(VHARN.id, () => undefined);
    const unseen = syncedCharacters(kaelCharacter());
    expect([
      characterSource(loading, BIA_AT_TABLE.userId).current(),
      characterSource(unseen, BIA_AT_TABLE.userId).current(),
    ]).toEqual([null, null]);
  });

  it('tells its listener when the characters change, until unsubscribed', () => {
    const characters = syncedCharacters();
    const heard: string[] = [];
    const source = characterSource(characters, BIA_AT_TABLE.userId);
    const unsubscribe = source.subscribe(() => heard.push('change'));
    characters.getState().apply(charactersSynced(4, lyraCharacter({ canControl: false })));
    unsubscribe();
    characters.getState().apply(charactersSynced(5, lyraCharacter()));
    expect({ heard, canControl: source.current()?.canControl }).toEqual({
      heard: ['change'],
      canControl: true,
    });
  });
});
