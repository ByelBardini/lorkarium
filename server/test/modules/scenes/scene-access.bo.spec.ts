import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { SceneAccessBo, type GridVisibility } from '../../../src/modules/scenes/scene-access.bo';
import { SceneNotFoundError } from '../../../src/modules/scenes/scenes.error';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { VHARN_CAST_ID, VHARN_SCENE_ID } from '../../support/scenes-factories';

const OSSUARY_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function accessOf(userId: string, role: 'master' | 'player' | null): SceneAccessBo {
  const campaign = new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
  return new SceneAccessBo(campaign, VHARN_SCENE_ID);
}

function grid(id: string, visibility: GridVisibility): { id: string; visibility: GridVisibility } {
  return { id, visibility };
}

describe('SceneAccessBo.requireAct', () => {
  it('Ana, the master, acts in a private grid that is not the group one', () => {
    expect(() => accessOf(ANA_ID, 'master').requireAct(grid(OSSUARY_ID, 'private'))).not.toThrow();
  });

  it('Bia acts in the group grid even while it is private', () => {
    const groupGrid = grid(VHARN_SCENE_ID, 'private');
    expect(() => accessOf(BIA_ID, 'player').requireAct(groupGrid)).not.toThrow();
  });

  it('Bia acts in a public grid that is not the group one', () => {
    expect(() => accessOf(BIA_ID, 'player').requireAct(grid(OSSUARY_ID, 'public'))).not.toThrow();
  });

  it('Bia in a private grid outside the group gets SCENE_NOT_FOUND citing the grid and her', () => {
    const reach = () => accessOf(BIA_ID, 'player').requireAct(grid(OSSUARY_ID, 'private'));
    expect(reach).toThrow(SceneNotFoundError);
    expect(reach).toThrow(
      expect.objectContaining({
        code: 'SCENE_NOT_FOUND',
        message: expect.stringMatching(new RegExp(`${BIA_ID}.*${OSSUARY_ID}.*${VHARN_ID}`)),
      }),
    );
  });

  it('a table with no group grid lets the player act only in public ones', () => {
    const campaign = new CampaignAccessBo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' });
    const access = new SceneAccessBo(campaign, null);
    expect(access.canSee(grid(OSSUARY_ID, 'public'))).toBe(true);
    expect(access.canSee(grid(VHARN_SCENE_ID, 'private'))).toBe(false);
  });

  it('someone outside the table gets CAMPAIGN_NOT_FOUND even for a public grid', () => {
    expect(() => accessOf(BIA_ID, null).requireAct(grid(OSSUARY_ID, 'public'))).toThrow(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    );
  });
});

describe('SceneAccessBo.seesEveryGrid', () => {
  it('is true for the master and false for a player', () => {
    expect(accessOf(ANA_ID, 'master').seesEveryGrid()).toBe(true);
    expect(accessOf(BIA_ID, 'player').seesEveryGrid()).toBe(false);
  });
});

describe('SceneAccessBo and the cast of the table', () => {
  const cast = { id: VHARN_CAST_ID, visibility: 'private', kind: 'cast' } as const;

  it('every member sees the cast, though it is private and not the group grid', () => {
    expect(accessOf(BIA_ID, 'player').canSee(cast)).toBe(true);
    expect(() => accessOf(BIA_ID, 'player').requireSee(cast)).not.toThrow();
    expect(() => accessOf(ANA_ID, 'master').requireSee(cast)).not.toThrow();
  });

  it('no one acts on the cast directly, not even Ana the master: SCENE_NOT_FOUND', () => {
    expect(() => accessOf(ANA_ID, 'master').requireAct(cast)).toThrow(SceneNotFoundError);
    expect(() => accessOf(BIA_ID, 'player').requireAct(cast)).toThrow(
      expect.objectContaining({ code: 'SCENE_NOT_FOUND' }),
    );
  });

  it('requireSee still refuses Bia a private grid outside the group', () => {
    const see = () => accessOf(BIA_ID, 'player').requireSee(grid(OSSUARY_ID, 'private'));
    expect(see).toThrow(expect.objectContaining({ code: 'SCENE_NOT_FOUND' }));
  });
});
