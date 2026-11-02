import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import {
  inLockedCharactersAndGrid,
  inLockedGridWithCharacters,
  requireCharactersLock,
  type CharactersAndGridLockDaos,
} from '../../../src/modules/characters/locked-characters-grid';
import type { SceneTransaction } from '../../../src/modules/scenes/locked-scene';
import { ANA_ID } from '../../support/auth-factories';
import { VHARN_ID } from '../../support/campaigns-factories';
import { CharactersDaoFake } from '../../support/characters-fakes';
import { ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';

const ana = new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' });
const ADDRESS = { campaignId: VHARN_ID, access: ana };

// The grid (version 4) and the characters (version 9) of Vharn, writing to one journal; the
// runner writes 'commit' only when the work resolves (a rolled-back run leaves no commit).
function vharn() {
  const scenes = new ScenesDaoFake([scenePo({ version: 4 })]);
  scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
  const characters = new CharactersDaoFake(scenes.journal, [], { [VHARN_ID]: 9 });
  const transaction: SceneTransaction<CharactersAndGridLockDaos> = async (work) => {
    const result = await work({ scenes, characters });
    scenes.journal.push('commit');
    return result;
  };
  return { journal: scenes.journal, transaction, scenes, characters };
}

describe('inLockedGridWithCharacters', () => {
  it('a work on unlinked tokens locks the grid alone and bumps only it', async () => {
    const { journal, transaction } = vharn();

    const saved = await inLockedGridWithCharacters(transaction, ADDRESS, async () => ({
      value: 'moved',
      grid: true,
      characters: false,
    }));

    expect(saved).toEqual({
      value: 'moved',
      grid: { sceneId: VHARN_SCENE_ID, version: 5 },
      characters: null,
      version: 5,
    });
    expect(journal).toEqual(['lock', 'bump', 'commit']);
  });

  it('a work that meets a character runs again with the characters locked before the grid', async () => {
    const { journal, transaction } = vharn();
    const runs: boolean[] = [];

    const saved = await inLockedGridWithCharacters(transaction, ADDRESS, async (locked) => {
      runs.push(locked.characters !== null);
      const characters = requireCharactersLock(locked);
      return { value: characters.version, grid: false, characters: true };
    });

    expect(runs).toEqual([false, true]);
    expect(journal).toEqual(['lock', 'lock characters', 'lock', 'bump characters', 'commit']);
    expect(saved).toEqual({ value: 9, grid: null, characters: 10, version: 10 });
  });

  it('a work that touched both bumps the characters first and answers the grid version', async () => {
    const { journal, transaction } = vharn();

    const saved = await inLockedGridWithCharacters(transaction, ADDRESS, async (locked) => {
      requireCharactersLock(locked);
      return { value: null, grid: true, characters: true };
    });

    expect(journal.slice(-3)).toEqual(['bump characters', 'bump', 'commit']);
    expect(saved).toMatchObject({ characters: 10, version: 5 });
  });

  it('a work that changed nothing keeps both versions and answers the grid as it was', async () => {
    const { journal, transaction } = vharn();

    const saved = await inLockedGridWithCharacters(transaction, ADDRESS, async () => ({
      value: null,
      grid: false,
      characters: false,
    }));

    expect(saved).toEqual({ value: null, grid: null, characters: null, version: 4 });
    expect(journal).toEqual(['lock', 'commit']);
  });

  it('another error of the work is not retried and reaches the caller', async () => {
    const { journal, transaction } = vharn();

    const failing = inLockedGridWithCharacters(transaction, ADDRESS, async () => {
      throw new Error('FORBIDDEN for Caio');
    });

    await expect(failing).rejects.toThrow('FORBIDDEN for Caio');
    expect(journal).toEqual(['lock']);
  });

  it('a work claiming a characters change without their lock fails citing the scene', async () => {
    const { transaction } = vharn();

    const claiming = inLockedGridWithCharacters(transaction, ADDRESS, async () => ({
      value: null,
      grid: false,
      characters: true,
    }));

    await expect(claiming).rejects.toThrow(
      `a work on scene ${VHARN_SCENE_ID} touched the characters without requireCharactersLock`,
    );
  });
});

describe('inLockedCharactersAndGrid', () => {
  it('locks the characters, then the grid, in one run', async () => {
    const { journal, transaction } = vharn();

    const saved = await inLockedCharactersAndGrid(transaction, ADDRESS, async (locked) => ({
      value: locked.characters?.version,
      grid: true,
      characters: false,
    }));

    expect(journal).toEqual(['lock characters', 'lock', 'bump', 'commit']);
    expect(saved).toMatchObject({ value: 9, version: 5, characters: null });
  });
});
