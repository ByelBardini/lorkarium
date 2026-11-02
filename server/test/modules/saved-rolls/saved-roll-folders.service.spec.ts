import { describe, expect, it } from 'vitest';
import { SavedRollFoldersService } from '../../../src/modules/saved-rolls/saved-roll-folders.service';
import {
  BIA_ID,
  CAIO_ID,
  DUDA_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { MembershipReadsFake } from '../../support/campaigns-fakes';
import {
  MAGIAS_ID,
  SavedRollFoldersDaoFake,
  SavedRollsDaoFake,
  SavedRollsTransactionRunnerFake,
  savedRollFolderPo,
} from '../../support/saved-rolls-fakes';

const BIA = { campaignId: VHARN_ID, userId: BIA_ID };
const CAIO = { campaignId: VHARN_ID, userId: CAIO_ID };
const DUDA = { campaignId: VHARN_ID, userId: DUDA_ID };

function setup(maxFolders = 50) {
  const journal: string[] = [];
  const members = new MembershipReadsFake([
    campaignMemberPo({ userId: BIA_ID, role: 'player' }),
    campaignMemberPo({ userId: CAIO_ID, role: 'player' }),
    campaignMemberPo({ userId: DUDA_ID, role: 'spectator' }),
  ]);
  const rolls = new SavedRollsDaoFake(journal);
  const folders = new SavedRollFoldersDaoFake(journal, [savedRollFolderPo()]);
  const transaction = new SavedRollsTransactionRunnerFake(journal, { rolls, folders }).run;
  const service = new SavedRollFoldersService({ members, folders, transaction, maxFolders });
  return { service, journal, folders };
}

describe('SavedRollFoldersService', () => {
  it('Bia lists hers and Caio sees none of them', async () => {
    const { service } = setup();

    expect(await service.list(BIA)).toEqual([{ id: MAGIAS_ID, name: 'Magias' }]);
    expect(await service.list(CAIO)).toEqual([]);
  });

  it('creates under the owner lock: lock → count → insert → commit', async () => {
    const { service, journal } = setup();

    const folder = await service.create(BIA, 'Ataques');

    expect(journal).toEqual(['lock', 'folder:count', 'folder:insert:Ataques', 'commit']);
    expect(folder.name).toBe('Ataques');
  });

  it('a repeated name, ignoring accents, is SAVED_ROLL_FOLDER_NAME_TAKEN', async () => {
    const { service } = setup();

    await expect(service.create(BIA, 'MÁGIAS')).rejects.toMatchObject({
      code: 'SAVED_ROLL_FOLDER_NAME_TAKEN',
    });
  });

  it('the folder past the ceiling is SAVED_ROLL_FOLDERS_LIMIT and nothing is inserted', async () => {
    const { service, journal } = setup(1);

    await expect(service.create(BIA, 'Ataques')).rejects.toMatchObject({
      code: 'SAVED_ROLL_FOLDERS_LIMIT',
    });
    expect(journal).not.toContain('folder:insert:Ataques');
  });

  it('renames her folder', async () => {
    const { service } = setup();

    expect(await service.rename(BIA, MAGIAS_ID, 'Feitiços')).toEqual({
      id: MAGIAS_ID,
      name: 'Feitiços',
    });
  });

  it('renaming or deleting a folder of someone else finds nothing', async () => {
    const { service, folders } = setup();

    await expect(service.rename(CAIO, MAGIAS_ID, 'Minha')).rejects.toMatchObject({
      code: 'SAVED_ROLL_FOLDER_NOT_FOUND',
    });
    await expect(service.remove(CAIO, MAGIAS_ID)).rejects.toMatchObject({
      code: 'SAVED_ROLL_FOLDER_NOT_FOUND',
    });
    expect(folders.rows.map(({ name }) => name)).toEqual(['Magias']);
  });

  it('deletes her folder', async () => {
    const { service, folders } = setup();

    await service.remove(BIA, MAGIAS_ID);

    expect(folders.rows).toEqual([]);
  });

  it('the spectator is refused before any read', async () => {
    const { service } = setup();

    await expect(service.list(DUDA)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
