import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { ANA_ID } from '../../support/auth-factories';
import { VHARN_ID } from '../../support/campaigns-factories';

function accessOf(role: 'master' | 'player' | null): CampaignAccessBo {
  return new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role });
}

describe('CampaignAccessBo', () => {
  it('the master passes requireMember and can see the join code', () => {
    const access = accessOf('master');
    expect(() => access.requireMember()).not.toThrow();
    expect(access.canSeeJoinCode()).toBe(true);
  });

  it('a player passes requireMember but cannot see the join code', () => {
    const access = accessOf('player');
    expect(() => access.requireMember()).not.toThrow();
    expect(access.canSeeJoinCode()).toBe(false);
  });

  it('someone without membership is refused with CAMPAIGN_NOT_FOUND citing campaign and user', () => {
    expect(() => accessOf(null).requireMember()).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_NOT_FOUND',
        message: expect.stringMatching(new RegExp(`${VHARN_ID}.*${ANA_ID}`)),
      }),
    );
  });

  it('someone without membership cannot see the join code', () => {
    expect(accessOf(null).canSeeJoinCode()).toBe(false);
  });

  it('requireMaster lets the master through', () => {
    expect(() => accessOf('master').requireMaster('configure the grid')).not.toThrow();
  });

  it('requireMaster refuses a player with FORBIDDEN citing user, action and campaign', () => {
    expect(() => accessOf('player').requireMaster('configure the grid')).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringMatching(new RegExp(`${ANA_ID}.*configure the grid.*${VHARN_ID}`)),
      }),
    );
  });

  it('requireMaster refuses someone without membership with CAMPAIGN_NOT_FOUND, not FORBIDDEN', () => {
    expect(() => accessOf(null).requireMaster('configure the grid')).toThrow(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    );
  });

  it('isMaster is true only for the master', () => {
    expect(accessOf('master').isMaster()).toBe(true);
    expect(accessOf('player').isMaster()).toBe(false);
  });

  it('isUser compares with the member the access was built for', () => {
    expect(accessOf('player').isUser(ANA_ID)).toBe(true);
    expect(accessOf('player').isUser(VHARN_ID)).toBe(false);
  });

  it('campaignIdOf names the table', () => {
    expect(accessOf('player').campaignIdOf()).toBe(VHARN_ID);
  });
});
