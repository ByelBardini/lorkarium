import { describe, expect, it } from 'vitest';
import {
  CampaignAccessBo,
  type CampaignRole,
} from '../../../src/modules/campaigns/campaign-access.bo';
import { MemberRoleBo } from '../../../src/modules/campaigns/member-role.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';

// Who asks (their role at Vharn) and whose role they ask to change (their role at Vharn).
function roleBo(
  requester: Readonly<{ userId: string; role: CampaignRole | null }>,
  target: Readonly<{ userId: string; role: CampaignRole | null }>,
): MemberRoleBo {
  return new MemberRoleBo(new CampaignAccessBo({ campaignId: VHARN_ID, ...requester }), target);
}

const ANA = { userId: ANA_ID, role: 'master' } as const;
const BIA = { userId: BIA_ID, role: 'player' } as const;
const DUDA = { userId: DUDA_ID, role: 'spectator' } as const;

describe('MemberRoleBo.decide', () => {
  it('Ana, the master, promoting Duda, a spectator, changes her from spectator to player', () => {
    expect(roleBo(ANA, DUDA).decide('player')).toEqual({
      change: 'changed',
      from: 'spectator',
      to: 'player',
    });
  });

  it('Ana moving Bia, a player, to the spectators changes her from player to spectator', () => {
    expect(roleBo(ANA, BIA).decide('spectator')).toEqual({
      change: 'changed',
      from: 'player',
      to: 'spectator',
    });
  });

  it('Ana asking player for Bia, already a player, is unchanged (asking again is harmless)', () => {
    expect(roleBo(ANA, BIA).decide('player')).toEqual({ change: 'unchanged', role: 'player' });
  });

  it.each([
    ['Bia, a player', BIA, DUDA],
    ['Duda, a spectator', DUDA, BIA],
  ])(
    '%s asking is refused with FORBIDDEN citing who asked, the table and the master role',
    (_who, requester, target) => {
      expect(() => roleBo(requester, target).decide('spectator')).toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringMatching(
            new RegExp(`${requester.userId}.*${target.userId}.*${VHARN_ID}.*the master role`),
          ),
        }),
      );
    },
  );

  it("Ana as the target is refused with FORBIDDEN citing her, the table and that the master's role does not change", () => {
    expect(() => roleBo(ANA, ANA).decide('spectator')).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringMatching(
          new RegExp(`${ANA_ID}.*${VHARN_ID}.*the master's role does not change`),
        ),
      }),
    );
  });

  it('Caio, who is not a member of Vharn, as the target is MEMBER_NOT_FOUND citing the table and his id', () => {
    expect(() => roleBo(ANA, { userId: CAIO_ID, role: null }).decide('player')).toThrow(
      expect.objectContaining({
        code: 'MEMBER_NOT_FOUND',
        message: expect.stringMatching(new RegExp(`${VHARN_ID}.*${CAIO_ID}`)),
      }),
    );
  });

  it('someone who is not a member of Vharn asking gets CAMPAIGN_NOT_FOUND, before the target is looked at', () => {
    const stranger = { userId: CAIO_ID, role: null };
    expect(() => roleBo(stranger, { userId: ANA_ID, role: null }).decide('player')).toThrow(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    );
  });
});
