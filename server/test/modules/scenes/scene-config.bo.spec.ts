import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { SceneConfigBo } from '../../../src/modules/scenes/scene-config.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';

const GRID_30_BY_20 = {
  widthCells: 30,
  heightCells: 20,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 15,
};

function configBy(userId: string, role: 'master' | 'player'): SceneConfigBo {
  return new SceneConfigBo(new CampaignAccessBo({ campaignId: VHARN_ID, userId, role }));
}

describe('SceneConfigBo', () => {
  it('the master configuring a 30×20 grid gets that grid to save', () => {
    expect(configBy(ANA_ID, 'master').configure(GRID_30_BY_20)).toEqual(GRID_30_BY_20);
  });

  it('a player configuring the grid is refused with FORBIDDEN citing the user', () => {
    expect(() => configBy(BIA_ID, 'player').configure(GRID_30_BY_20)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN', message: expect.stringContaining(BIA_ID) }),
    );
  });
});
