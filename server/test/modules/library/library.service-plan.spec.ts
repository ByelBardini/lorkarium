import { SCENE_FOLDER_DEPTH_MAX } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { LibraryService } from '../../../src/modules/library/library.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, VHARN_ID, campaignMemberPo, campaignPo } from '../../support/campaigns-factories';
import { librarySceneRow } from '../../support/library-factories';
import {
  LibraryPublisherFake,
  LibraryScenesDaoFake,
  LibraryTransactionRunnerFake,
  OwnerPlanCampaignsDaoFake,
  SceneAudienceFake,
  SceneFoldersDaoFake,
  sceneCopyDaoFakes,
} from '../../support/library-fakes';
import { planAccount } from '../../support/plan-account-fakes';
import { BoardPublisherFake } from '../../support/scenes-fakes';

const ANA = { userId: ANA_ID, campaignId: VHARN_ID };
const BIA = { userId: BIA_ID, campaignId: VHARN_ID };
// Five grids of Vharn, the oldest first; the group one is the 1st.
const GRIDS = [1, 2, 3, 4, 5].map((n) => `0d0d0d0d-0d0d-4d0d-8d0d-00000000000${n}`);
const [SALAO, , TERCEIRO, QUARTO, QUINTO] = GRIDS as [string, string, string, string, string];

const readOnly = (position: number) =>
  expect.objectContaining({
    code: 'PLAN_LIMIT',
    reason: 'readOnly',
    resource: 'scenes',
    stored: position,
    limit: 3,
    plan: 'free',
  });

describe('LibraryService on a free table with 5 grids made above the plan', () => {
  let journal: string[];
  let scenes: LibraryScenesDaoFake;
  let publisher: LibraryPublisherFake;
  let service: LibraryService;

  beforeEach(() => {
    journal = [];
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    const campaigns = new OwnerPlanCampaignsDaoFake(journal, [
      campaignPo({ id: VHARN_ID, activeSceneId: SALAO }),
    ]);
    campaigns.owner = planAccount({ plan: 'free' });
    scenes = new LibraryScenesDaoFake(
      journal,
      GRIDS.map((id, index) => librarySceneRow({ id, name: `Grid ${index + 1}` })),
    );
    const folders = new SceneFoldersDaoFake(journal);
    const daos = { campaigns, folders, scenes, ...sceneCopyDaoFakes(journal) };
    publisher = new LibraryPublisherFake(journal);
    service = new LibraryService({
      members,
      read: daos,
      transaction: new LibraryTransactionRunnerFake(journal, daos).run,
      publisher,
      audience: new SceneAudienceFake(journal),
      grids: new BoardPublisherFake([]),
      clock: new ClockFake(new Date('2026-11-18T12:00:00Z')),
      maxFolderDepth: SCENE_FOLDER_DEPTH_MAX,
    });
  });

  it('renaming the 4th grid is refused with PLAN_LIMIT readOnly before saving or publishing', async () => {
    await expect(service.updateScene(ANA, QUARTO, { name: 'Cripta' })).rejects.toThrow(readOnly(4));

    expect(journal).toEqual(['lock']);
    expect(publisher.changes).toEqual([]);
  });

  it('moving the 5th grid to the root is refused with PLAN_LIMIT readOnly', async () => {
    await expect(service.updateScene(ANA, QUINTO, { folderId: null })).rejects.toThrow(readOnly(5));
  });

  it('renaming the 3rd grid passes and its card is not locked', async () => {
    const card = await service.updateScene(ANA, TERCEIRO, { name: 'Salão' });

    expect(card).toMatchObject({ name: 'Salão', planLocked: false });
  });

  it('publishing the 4th grid passes (visibility is not setup) and its card says planLocked', async () => {
    const card = await service.updateScene(ANA, QUARTO, { visibility: 'public' });

    expect(card).toMatchObject({ visibility: 'public', planLocked: true });
  });

  it('duplicating the 4th grid is refused as readOnly, before the plan lacking copies', async () => {
    await expect(service.duplicate(ANA, QUARTO)).rejects.toThrow(readOnly(4));

    expect(journal).toEqual(['lock']);
  });

  it('deleting the 2nd grid frees the old 4th, which renames', async () => {
    await service.deleteScene(ANA, GRIDS[1]!);

    const card = await service.updateScene(ANA, QUARTO, { name: 'Cripta' });

    expect(card).toMatchObject({ name: 'Cripta', planLocked: false });
  });

  it('the list marks planLocked from the 4th grid on', async () => {
    const library = await service.list(ANA);

    expect(library.scenes.map(({ planLocked }) => planLocked)).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it("a player's list ranks each grid among all of the table's, not only the ones Bia sees", async () => {
    scenes.rows[4]!.visibility = 'public';

    const library = await service.list(BIA);

    expect(library.scenes.map(({ id, planLocked }) => [id, planLocked])).toEqual([
      [SALAO, false],
      [QUINTO, true],
    ]);
  });
});
