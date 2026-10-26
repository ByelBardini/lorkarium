import { describe, expect, it } from 'vitest';
import { CampaignJoinBo } from '../../../src/modules/campaigns/campaign-join.bo';
import { VHARN_ID } from '../../support/campaigns-factories';

function joinOf(isMember: boolean, hasPassword: boolean, isPublic = false): CampaignJoinBo {
  return new CampaignJoinBo({ campaignId: VHARN_ID, isMember, hasPassword, isPublic });
}

describe('CampaignJoinBo', () => {
  it.each([true, false])(
    'someone who is already a member gets already-member (campaign has password: %s)',
    (hasPassword) => {
      expect(joinOf(true, hasPassword).decide('not-required')).toBe('already-member');
    },
  );

  it('a member never needs the password checked', () => {
    expect(joinOf(true, true).needsPasswordCheck()).toBe(false);
  });

  it('a newcomer to a campaign with a password needs it checked', () => {
    expect(joinOf(false, true).needsPasswordCheck()).toBe(true);
  });

  it('a newcomer to a campaign without a password joins as spectator', () => {
    const join = joinOf(false, false);
    expect(join.needsPasswordCheck()).toBe(false);
    expect(join.decide('not-required')).toBe('join-as-spectator');
  });

  it('a campaign with a password and none sent is refused with CAMPAIGN_PASSWORD_REQUIRED', () => {
    expect(() => joinOf(false, true).decide('missing')).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_PASSWORD_REQUIRED',
        message: expect.stringContaining(VHARN_ID),
      }),
    );
  });

  it('a password that does not match is refused with CAMPAIGN_PASSWORD_INVALID', () => {
    expect(() => joinOf(false, true).decide('mismatch')).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_PASSWORD_INVALID',
        message: expect.stringContaining(VHARN_ID),
      }),
    );
  });

  it('a password that matches joins as spectator', () => {
    expect(joinOf(false, true).decide('matches')).toBe('join-as-spectator');
  });

  it('a campaign with a password reported as not-required is a programming error citing the campaign', () => {
    expect(() => joinOf(false, true).decide('not-required')).toThrow(VHARN_ID);
  });

  it('a public campaign may be joined without its code', () => {
    expect(() => joinOf(false, false, true).requirePublic()).not.toThrow();
  });

  it('a private campaign joined without its code is refused with CAMPAIGN_NOT_FOUND citing it', () => {
    expect(() => joinOf(false, false, false).requirePublic()).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_NOT_FOUND',
        message: expect.stringContaining(VHARN_ID),
      }),
    );
  });

  it('even a member of a private campaign is refused there: the code is the only way in', () => {
    expect(() => joinOf(true, false, false).requirePublic()).toThrow(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    );
  });
});
