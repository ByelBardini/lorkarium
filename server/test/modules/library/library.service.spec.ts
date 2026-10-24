import { SCENE_FOLDER_DEPTH_MAX } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { LibraryService } from '../../../src/modules/library/library.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
  campaignPo,
} from '../../support/campaigns-factories';
import {
  ATO_1_ID,
  MASMORRA_ID,
  QUELM_FOLDER_ID,
  TORRE_ID,
  librarySceneRow,
  sceneFolderPo,
} from '../../support/library-factories';
import {
  LibraryCampaignsDaoFake,
  LibraryPublisherFake,
  LibraryScenesDaoFake,
  LibraryTransactionRunnerFake,
  SceneAudienceFake,
  SceneFoldersDaoFake,
  sceneCopyDaoFakes,
} from '../../support/library-fakes';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import { BoardPublisherFake } from '../../support/scenes-fakes';

const NOW = new Date('2026-10-22T21:00:00Z');
const MAP_ID = '4e5f6a7b-8c9d-4e0f-8a1b-3c4d5e6f7a8b';
const ANA = { userId: ANA_ID, campaignId: VHARN_ID };
const BIA = { userId: BIA_ID, campaignId: VHARN_ID };

describe('LibraryService', () => {
  let journal: string[];
  let scenes: LibraryScenesDaoFake;
  let folders: SceneFoldersDaoFake;
  let publisher: LibraryPublisherFake;
  let audience: SceneAudienceFake;
  let grids: BoardPublisherFake;
  let service: LibraryService;

  beforeEach(() => {
    journal = [];
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    const campaigns = new LibraryCampaignsDaoFake(journal, [
      campaignPo({ id: VHARN_ID, activeSceneId: VHARN_SCENE_ID }),
    ]);
    folders = new SceneFoldersDaoFake(journal, [
      sceneFolderPo(),
      sceneFolderPo({ id: MASMORRA_ID, name: 'Masmorra', parentId: ATO_1_ID }),
      sceneFolderPo({ id: QUELM_FOLDER_ID, campaignId: QUELM_ID, name: 'Quelm' }),
    ]);
    scenes = new LibraryScenesDaoFake(journal, [
      librarySceneRow({ name: 'Salão do Sino', tokenCount: 2 }),
      librarySceneRow({ id: TORRE_ID, name: 'Torre', visibility: 'public', tokenCount: 5 }),
    ]);
    const daos = { campaigns, folders, scenes, ...sceneCopyDaoFakes(journal) };
    const transaction = new LibraryTransactionRunnerFake(journal, daos).run;
    publisher = new LibraryPublisherFake(journal);
    audience = new SceneAudienceFake(journal);
    grids = new BoardPublisherFake([]);
    const clock = new ClockFake(NOW);
    const maxFolderDepth = SCENE_FOLDER_DEPTH_MAX;
    const deps = {
      members,
      read: daos,
      transaction,
      publisher,
      audience,
      grids,
      clock,
      maxFolderDepth,
    };
    service = new LibraryService(deps);
  });

  it('Ana creating a grid in Ato 1 locks, saves, commits and then tells the table', async () => {
    const created = await service.createScene(ANA, { folderId: ATO_1_ID });

    expect(created).toMatchObject({ name: 'Grid sem nome', folderId: ATO_1_ID, tokenCount: 0 });
    expect(created.visibility).toBe('private');
    expect(journal).toEqual(['lock', 'save', 'commit', 'publish']);
    expect(publisher.changes).toEqual([{ campaignId: VHARN_ID, at: NOW.toISOString() }]);
  });

  it('Ana publishing the Torre saves it and answers the card with its token count', async () => {
    const saved = await service.updateScene(ANA, VHARN_SCENE_ID, { visibility: 'public' });

    expect(saved).toMatchObject({ id: VHARN_SCENE_ID, visibility: 'public', tokenCount: 2 });
    expect(journal).toEqual(['lock', 'save', 'commit', 'publish']);
  });

  it('hiding the Torre takes its players out after the commit and before library:changed', async () => {
    await service.updateScene(ANA, TORRE_ID, { visibility: 'private' });

    expect(journal).toEqual(['lock', 'save', 'commit', 'evict players', 'publish']);
    const at = NOW.toISOString();
    expect(audience.evictions).toEqual([
      { campaignId: VHARN_ID, sceneId: TORRE_ID, audience: 'players', reason: 'private', at },
    ]);
  });

  it('hiding the group grid evicts nobody: the group stays on it', async () => {
    await service.updateScene(ANA, VHARN_SCENE_ID, { visibility: 'private' });

    expect(journal).toEqual(['lock', 'save', 'commit', 'publish']);
    expect(audience.evictions).toEqual([]);
  });

  it('renaming the Torre evicts nobody', async () => {
    await service.updateScene(ANA, TORRE_ID, { name: 'Torre Velha' });

    expect(audience.evictions).toEqual([]);
  });

  it('renaming the Torre bumps its version and tells its rooms the new name after the commit', async () => {
    const before = scenes.rows.find((row) => row.id === TORRE_ID)?.version ?? 0;

    await service.updateScene(ANA, TORRE_ID, { name: 'Torre Velha' });

    expect(journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
    expect(grids.sceneUpdates).toMatchObject([
      {
        campaignId: VHARN_ID,
        sceneId: TORRE_ID,
        version: before + 1,
        at: NOW.toISOString(),
        scene: { id: TORRE_ID, name: 'Torre Velha' },
      },
    ]);
  });

  it('moving or publishing the Torre keeps its version and tells its rooms nothing', async () => {
    await service.updateScene(ANA, TORRE_ID, { visibility: 'public', folderId: ATO_1_ID });

    expect(journal).not.toContain('bump');
    expect(grids.sceneUpdates).toEqual([]);
  });

  it('deleting the Torre takes everyone who had it open out, after the commit', async () => {
    await service.deleteScene(ANA, TORRE_ID);

    expect(journal).toEqual(['lock', 'save', 'commit', 'evict everyone', 'publish']);
    expect(audience.evictions).toMatchObject([
      { campaignId: VHARN_ID, sceneId: TORRE_ID, audience: 'everyone', reason: 'deleted' },
    ]);
  });

  it('a refused delete of the group grid evicts nobody', async () => {
    await expect(service.deleteScene(ANA, VHARN_SCENE_ID)).rejects.toThrow();

    expect(audience.evictions).toEqual([]);
  });

  it('Bia creating a grid is FORBIDDEN before any lock, and nothing is told', async () => {
    await expect(service.createScene(BIA, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(journal).toEqual([]);
    expect(scenes.rows).toHaveLength(2);
  });

  it('a folder of Quelm is FOLDER_NOT_FOUND, with nothing saved, committed or told', async () => {
    const refused = service.createScene(ANA, { folderId: QUELM_FOLDER_ID });

    await expect(refused).rejects.toMatchObject({ code: 'FOLDER_NOT_FOUND' });
    expect(journal).toEqual(['lock']);
  });

  it('deleting the group grid is SCENE_IS_ACTIVE and the grid stays', async () => {
    const refused = service.deleteScene(ANA, VHARN_SCENE_ID);

    await expect(refused).rejects.toMatchObject({ code: 'SCENE_IS_ACTIVE' });
    expect(scenes.rows.map(({ id }) => id)).toContain(VHARN_SCENE_ID);
    expect(publisher.changes).toEqual([]);
  });

  it('deleting a grid of another table is SCENE_NOT_FOUND citing it and Ana', async () => {
    const strayId = '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f';
    const refused = service.deleteScene(ANA, strayId);

    await expect(refused).rejects.toMatchObject({
      code: 'SCENE_NOT_FOUND',
      message: expect.stringContaining(`user ${ANA_ID} has no grid ${strayId}`),
    });
    expect(publisher.changes).toEqual([]);
  });

  it('Bia lists the public grid and the group one without token counts nor Ato 1', async () => {
    const library = await service.list(BIA);

    expect(library.activeSceneId).toBe(VHARN_SCENE_ID);
    expect(library.scenes.map(({ name, tokenCount }) => [name, tokenCount])).toEqual([
      ['Salão do Sino', null],
      ['Torre', null],
    ]);
    expect(library.folders).toEqual([]);
  });

  it('Ana lists every grid with its token count and every folder of Vharn only', async () => {
    const library = await service.list(ANA);

    expect(library.scenes.map(({ tokenCount }) => tokenCount)).toEqual([2, 5]);
    expect(library.folders).toEqual([
      { id: ATO_1_ID, name: 'Ato 1', parentId: null },
      { id: MASMORRA_ID, name: 'Masmorra', parentId: ATO_1_ID },
    ]);
  });

  it('deleting Ato 1 lifts Masmorra and its grid to the root, then deletes, in one transaction', async () => {
    scenes.rows.push(librarySceneRow({ id: TORRE_ID.replace('3d', '4e'), folderId: ATO_1_ID }));

    await service.deleteFolder(ANA, ATO_1_ID);

    expect(journal).toEqual(['lock', 'moveChildren', 'moveScenes', 'delete', 'commit', 'publish']);
    expect(folders.rows.map(({ id, parentId }) => [id, parentId])).toEqual([
      [MASMORRA_ID, null],
      [QUELM_FOLDER_ID, null],
    ]);
    expect(scenes.rows.map(({ folderId }) => folderId)).toEqual([null, null, null]);
  });

  it('moving Ato 1 into Masmorra, its child, is FOLDER_CYCLE and nothing is saved', async () => {
    const refused = service.updateFolder(ANA, ATO_1_ID, { parentId: MASMORRA_ID });

    await expect(refused).rejects.toMatchObject({ code: 'FOLDER_CYCLE' });
    expect(journal).toEqual(['lock']);
  });

  it('Ana creating "Cripta" in Masmorra inserts it and tells the table', async () => {
    const created = await service.createFolder(ANA, { name: 'Cripta', parentId: MASMORRA_ID });

    expect(created).toMatchObject({ name: 'Cripta', parentId: MASMORRA_ID });
    expect(journal).toEqual(['lock', 'insert', 'commit', 'publish']);
  });

  it('renaming a folder of Quelm is FOLDER_NOT_FOUND and tells nobody', async () => {
    const refused = service.updateFolder(ANA, QUELM_FOLDER_ID, { name: 'Roubada' });

    await expect(refused).rejects.toMatchObject({ code: 'FOLDER_NOT_FOUND' });
    expect(publisher.changes).toEqual([]);
  });

  it('duplicating the Salão inserts the copy, copies the five tables, commits and tells the table', async () => {
    scenes.rows[0] = librarySceneRow({
      name: 'Salão do Sino',
      folderId: ATO_1_ID,
      visibility: 'public',
      widthCells: 30,
      backgroundAssetId: MAP_ID,
      visionMode: 'dark',
    });

    const copy = await service.duplicate(ANA, VHARN_SCENE_ID);

    expect(journal).toEqual([
      'lock',
      'save',
      ...['tokens', 'walls', 'lights', 'drawings', 'areas'].map(
        (what) => `copy ${what} ${VHARN_SCENE_ID} → ${copy.id}`,
      ),
      'commit',
      'publish',
    ]);
    expect(copy).toMatchObject({
      name: 'Salão do Sino (cópia)',
      folderId: ATO_1_ID,
      visibility: 'private',
      widthCells: 30,
    });
    expect(scenes.rows.at(-1)).toMatchObject({ backgroundAssetId: MAP_ID, visionMode: 'dark' });
  });

  it('duplicating a grid of 60 characters cuts the name so the suffix fits', async () => {
    scenes.rows[1] = librarySceneRow({ id: TORRE_ID, name: 'T'.repeat(60) });

    const copy = await service.duplicate(ANA, TORRE_ID);

    expect(copy.name).toBe(`${'T'.repeat(52)} (cópia)`);
  });

  it('duplicating a grid of another table is SCENE_NOT_FOUND and copies nothing', async () => {
    const strayId = '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f';

    await expect(service.duplicate(ANA, strayId)).rejects.toMatchObject({
      code: 'SCENE_NOT_FOUND',
    });
    expect(journal).toEqual(['lock']);
  });

  it('Bia duplicating is FORBIDDEN', async () => {
    await expect(service.duplicate(BIA, VHARN_SCENE_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(journal).toEqual([]);
  });

  it('Bia deleting a folder is FORBIDDEN and Ato 1 stays', async () => {
    await expect(service.deleteFolder(BIA, ATO_1_ID)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(folders.rows.map(({ id }) => id)).toContain(ATO_1_ID);
  });
});
