import { describe, expect, it } from 'vitest';
import {
  charactersEventBase,
  inLockedCharacters,
  type CharactersLockDaos,
  type CharactersTransaction,
} from '../../../src/modules/characters/locked-characters';
import { ClockFake } from '../../support/auth-fakes';
import { VHARN_ID } from '../../support/campaigns-factories';
import { CharactersDaoFake } from '../../support/characters-fakes';

const MISSING_ID = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

function runnerOver(characters: CharactersDaoFake): CharactersTransaction<CharactersLockDaos> {
  return async (work) => {
    const result = await work({ characters });
    characters.journal.push('commit');
    return result;
  };
}

describe('inLockedCharacters', () => {
  it('a work that changed the characters bumps their version once, between the lock and the commit', async () => {
    const characters = new CharactersDaoFake([], [], { [VHARN_ID]: 4 });

    const saved = await inLockedCharacters(
      runnerOver(characters),
      VHARN_ID,
      async ({ version }) => ({
        value: version,
        changed: true,
      }),
    );

    expect(saved).toEqual({ value: 4, version: 5, changed: true });
    expect(characters.journal).toEqual(['lock characters', 'bump characters', 'commit']);
  });

  it('a work that changed nothing keeps the version and does not bump', async () => {
    const characters = new CharactersDaoFake([], [], { [VHARN_ID]: 4 });

    const saved = await inLockedCharacters(runnerOver(characters), VHARN_ID, async () => ({
      value: 'same',
      changed: false,
    }));

    expect(saved).toEqual({ value: 'same', version: 4, changed: false });
    expect(characters.journal).toEqual(['lock characters', 'commit']);
  });

  it('a table with no row to lock fails citing it, before the work runs', async () => {
    const characters = new CharactersDaoFake();
    let ran = false;

    const locked = inLockedCharacters(runnerOver(characters), MISSING_ID, async () => {
      ran = true;
      return { value: null, changed: true };
    });

    await expect(locked).rejects.toThrow(
      `campaign ${MISSING_ID} has no row to lock its characters`,
    );
    expect(ran).toBe(false);
  });
});

describe('charactersEventBase', () => {
  it('opens an event with the table, the version and now', () => {
    const clock = new ClockFake(new Date('2026-10-31T21:00:00Z'));

    expect(charactersEventBase(VHARN_ID, 5, clock)).toEqual({
      campaignId: VHARN_ID,
      version: 5,
      at: '2026-10-31T21:00:00.000Z',
    });
  });
});
