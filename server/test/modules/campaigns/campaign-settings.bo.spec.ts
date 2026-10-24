import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { CampaignSettingsBo } from '../../../src/modules/campaigns/campaign-settings.bo';
import { ANA_ID } from '../../support/auth-factories';
import { VHARN_ID } from '../../support/campaigns-factories';

const COVER_ID = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';

function settingsOf(role: 'master' | 'player' | null, atTable = true): CampaignSettingsBo {
  return new CampaignSettingsBo(
    new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role }),
    atTable,
  );
}

describe('CampaignSettingsBo.requireMasterAtTable', () => {
  it('lets the master with the table open through', () => {
    expect(() => settingsOf('master').requireMasterAtTable('delete the campaign')).not.toThrow();
  });

  it('refuses the master without the table open with CAMPAIGN_NOT_OPEN citing the table, the user and the action', () => {
    expect(() => settingsOf('master', false).requireMasterAtTable('delete the campaign')).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_NOT_OPEN',
        message: expect.stringMatching(new RegExp(`${ANA_ID}.*delete the campaign.*${VHARN_ID}`)),
      }),
    );
  });

  it('a player away from the table still gets FORBIDDEN, not CAMPAIGN_NOT_OPEN', () => {
    expect(() => settingsOf('player', false).requireMasterAtTable('delete the campaign')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('someone outside the table and away from it still gets CAMPAIGN_NOT_FOUND', () => {
    expect(() => settingsOf(null, false).requireMasterAtTable('delete the campaign')).toThrow(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    );
  });

  it('refuses a player with FORBIDDEN citing the table, the user and the action', () => {
    expect(() => settingsOf('player').requireMasterAtTable('delete the campaign')).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringMatching(new RegExp(`${ANA_ID}.*delete the campaign.*${VHARN_ID}`)),
      }),
    );
  });

  it('refuses someone outside the table with CAMPAIGN_NOT_FOUND, not FORBIDDEN', () => {
    expect(() => settingsOf(null).requireMasterAtTable('delete the campaign')).toThrow(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    );
  });
});

describe('CampaignSettingsBo.passwordChange', () => {
  it('an absent password keeps the current one', () => {
    expect(settingsOf('master').passwordChange(undefined)).toEqual({ kind: 'keep' });
  });

  it('a null password removes it', () => {
    expect(settingsOf('master').passwordChange(null)).toEqual({ kind: 'remove' });
  });

  it('a text replaces it', () => {
    expect(settingsOf('master').passwordChange('sino')).toEqual({
      kind: 'replace',
      password: 'sino',
    });
  });
});

describe('CampaignSettingsBo.requireCoverImage', () => {
  it('a cover asset of this table passes', () => {
    const check = () =>
      settingsOf('master').requireCoverImage({ assetId: COVER_ID, purpose: 'cover' });
    expect(check).not.toThrow();
  });

  it('an asset of this table sent for a token is refused with INVALID_BODY citing its purpose', () => {
    const check = () =>
      settingsOf('master').requireCoverImage({ assetId: COVER_ID, purpose: 'token' });
    expect(check).toThrow(
      expect.objectContaining({
        code: 'INVALID_BODY',
        message: expect.stringMatching(new RegExp(`${COVER_ID}.*${VHARN_ID}.*purpose token`)),
      }),
    );
  });

  it('an asset that is not of this table is refused with INVALID_BODY', () => {
    const check = () =>
      settingsOf('master').requireCoverImage({ assetId: COVER_ID, purpose: null });
    expect(check).toThrow(
      expect.objectContaining({
        code: 'INVALID_BODY',
        message: expect.stringContaining('no asset of this campaign'),
      }),
    );
  });
});
