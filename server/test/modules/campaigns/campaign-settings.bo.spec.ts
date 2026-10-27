import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { CampaignSettingsBo } from '../../../src/modules/campaigns/campaign-settings.bo';
import { ANA_ID } from '../../support/auth-factories';
import { VHARN_ID } from '../../support/campaigns-factories';

const COVER_ID = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';

type Powers = Readonly<{ owner: boolean; juggernaut: boolean }>;

const OWNER: Powers = { owner: true, juggernaut: false };
const CO_MASTER: Powers = { owner: false, juggernaut: false };
const JUGGERNAUT: Powers = { owner: false, juggernaut: true };

// Ana by default, the owner of Vharn; `powers` turns her into a co-master or a juggernaut.
function settingsOf(
  role: 'master' | 'player' | null,
  atTable = true,
  powers: Powers = OWNER,
): CampaignSettingsBo {
  return new CampaignSettingsBo(
    new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role }),
    atTable,
    powers,
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

describe('CampaignSettingsBo.requireOwnerPowersAtTable (deleting the campaign)', () => {
  const DELETE = 'delete the campaign';

  it.each([
    ['the owner', OWNER],
    ['a juggernaut', JUGGERNAUT],
  ])('%s with the table open may delete it', (_who, powers) => {
    expect(settingsOf('master', true, powers).requireOwnerPowersAtTable(DELETE)).toBeUndefined();
  });

  it('a co-master with the table open is FORBIDDEN citing her, the action and owner powers', () => {
    expect(() => settingsOf('master', true, CO_MASTER).requireOwnerPowersAtTable(DELETE)).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringMatching(
          new RegExp(`${ANA_ID}.*${DELETE}.*${VHARN_ID}.*owner powers`),
        ),
      }),
    );
  });

  it('a co-master with the table open still edits and hands out a new code', () => {
    const coMaster = settingsOf('master', true, CO_MASTER);
    expect(coMaster.requireMasterAtTable('change the campaign settings')).toBeUndefined();
    expect(coMaster.requireMasterAtTable('generate another join code')).toBeUndefined();
  });

  it('the owner away from the table is CAMPAIGN_NOT_OPEN', () => {
    expect(() => settingsOf('master', false).requireOwnerPowersAtTable(DELETE)).toThrow(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_OPEN' }),
    );
  });

  it('a player is FORBIDDEN citing the master role, and a stranger CAMPAIGN_NOT_FOUND', () => {
    expect(() => settingsOf('player').requireOwnerPowersAtTable(DELETE)).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringContaining('the master role'),
      }),
    );
    expect(() => settingsOf(null).requireOwnerPowersAtTable(DELETE)).toThrow(
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
