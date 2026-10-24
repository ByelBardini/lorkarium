import { beforeEach, describe, expect, it } from 'vitest';
import { SceneActivationService } from '../../../src/modules/scenes/scene-activation.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, VHARN_ID, campaignMemberPo, campaignPo } from '../../support/campaigns-factories';
import { TORRE_ID, librarySceneRow } from '../../support/library-factories';
import {
  LibraryCampaignsDaoFake,
  LibraryPublisherFake,
  LibraryScenesDaoFake,
  SceneActivationRunnerFake,
  SceneAudienceFake,
} from '../../support/library-fakes';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';

const NOW = new Date('2026-10-23T20:00:00Z');
const ESTRADA_ID = '5f6a7b8c-9d0e-4f1a-8b2c-4d5e6f7a8b9c';
const QUELM_GRID_ID = '6a7b8c9d-0e1f-4a2b-9c3d-5e6f7a8b9c0d';

describe('SceneActivationService', () => {
  let journal: string[];
  let campaigns: LibraryCampaignsDaoFake;
  let audience: SceneAudienceFake;
  let publisher: LibraryPublisherFake;
  let service: SceneActivationService;

  beforeEach(() => {
    journal = [];
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    campaigns = new LibraryCampaignsDaoFake(journal, [
      campaignPo({ id: VHARN_ID, activeSceneId: VHARN_SCENE_ID }),
    ]);
    const scenes = new LibraryScenesDaoFake(journal, [
      librarySceneRow({ name: 'Salão do Sino' }),
      librarySceneRow({ id: ESTRADA_ID, name: 'Estrada de Vharn', visibility: 'public' }),
      librarySceneRow({ id: TORRE_ID, name: 'Torre' }),
    ]);
    const transaction = new SceneActivationRunnerFake(journal, { campaigns, scenes }).run;
    audience = new SceneAudienceFake(journal);
    publisher = new LibraryPublisherFake(journal);
    const clock = new ClockFake(NOW);
    service = new SceneActivationService({ members, transaction, audience, publisher, clock });
  });

  it('Ana taking the group to the Estrada locks, saves, commits, moves the table and only then tells it', async () => {
    await service.activate(ANA_ID, VHARN_ID, ESTRADA_ID);

    expect(journal).toEqual([
      'lock',
      'setActiveScene',
      'commit',
      'move audience',
      'publish activated',
      'publish',
    ]);
    expect(campaigns.rows[0]?.activeSceneId).toBe(ESTRADA_ID);
  });

  it('the move names the private Salão as the grid before, whose players do not keep a tab', async () => {
    await service.activate(ANA_ID, VHARN_ID, ESTRADA_ID);

    const at = NOW.toISOString();
    expect(audience.moves).toEqual([
      {
        campaignId: VHARN_ID,
        sceneId: ESTRADA_ID,
        previous: { sceneId: VHARN_SCENE_ID, playersKeepTabs: false },
        at,
      },
    ]);
    expect(publisher.activations).toEqual([
      { campaignId: VHARN_ID, sceneId: ESTRADA_ID, previousSceneId: VHARN_SCENE_ID, at },
    ]);
    expect(publisher.changes).toEqual([{ campaignId: VHARN_ID, at }]);
  });

  it('leaving the public Estrada for the Torre lets the players keep the Estrada as a tab', async () => {
    await service.activate(ANA_ID, VHARN_ID, ESTRADA_ID);

    await service.activate(ANA_ID, VHARN_ID, TORRE_ID);

    const previous = { sceneId: ESTRADA_ID, playersKeepTabs: true };
    expect(audience.moves[1]).toMatchObject({ sceneId: TORRE_ID, previous });
  });

  it('a table with no group grid moves with previous null and previousSceneId null', async () => {
    const campaign = campaigns.rows[0];
    if (campaign) campaign.activeSceneId = null;

    await service.activate(ANA_ID, VHARN_ID, ESTRADA_ID);

    expect(audience.moves[0]?.previous).toBeNull();
    expect(publisher.activations[0]?.previousSceneId).toBeNull();
  });

  it('Bia taking the group anywhere is FORBIDDEN, with nothing locked, moved or told', async () => {
    const refused = service.activate(BIA_ID, VHARN_ID, ESTRADA_ID);

    await expect(refused).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(journal).toEqual([]);
    expect(campaigns.rows[0]?.activeSceneId).toBe(VHARN_SCENE_ID);
  });

  it('a grid of Quelm is SCENE_NOT_FOUND citing it, and the group grid stays', async () => {
    const refused = service.activate(ANA_ID, VHARN_ID, QUELM_GRID_ID);

    await expect(refused).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    await expect(refused).rejects.toThrow(QUELM_GRID_ID);
    expect(journal).toEqual(['lock']);
    expect(campaigns.rows[0]?.activeSceneId).toBe(VHARN_SCENE_ID);
  });

  it('taking the group to the grid it is already on saves, moves and tells nothing', async () => {
    await service.activate(ANA_ID, VHARN_ID, VHARN_SCENE_ID);

    expect(journal).toEqual(['lock', 'commit']);
    expect(publisher.activations).toEqual([]);
  });
});
