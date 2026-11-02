import { describe, expect, it } from 'vitest';
import {
  orderedMembers,
  toCampaignDetailDto,
  toCampaignInfoDto,
  toCampaignSummaryDto,
  toPublicCampaignDto,
  type CampaignDetailView,
} from '../../../src/modules/campaigns/campaigns.mapper';
import type { PublicCampaignRow } from '../../../src/modules/campaigns/campaign-members.dao';
import { ANA_ID } from '../../support/auth-factories';
import {
  BIA_ID,
  CAIO_ID,
  DUDA_ID,
  VHARN_ID,
  campaignListingRow,
  campaignMemberPo,
  campaignMemberRow,
  campaignPo,
} from '../../support/campaigns-factories';

// Bia, the co-master, is named Ágata so she sorts before Ana by name; Abel, a player, sorts
// before both: only the owner rule puts Ana first and the master rule puts Bia before Abel.
const ANA = campaignMemberRow({ userId: ANA_ID, name: 'Ana', role: 'master', owner: true });
const BIA = campaignMemberRow({ userId: BIA_ID, name: 'Ágata', role: 'master', owner: false });
const ABEL = campaignMemberRow({ userId: DUDA_ID, name: 'Abel', role: 'player', owner: false });
const CAIO = campaignMemberRow({ userId: CAIO_ID, name: 'Caio', role: 'player', owner: false });

function detailView(overrides: Partial<CampaignDetailView> = {}): CampaignDetailView {
  return {
    campaign: campaignPo({ ownerId: ANA_ID }),
    membership: campaignMemberPo({ userId: CAIO_ID, role: 'player' }),
    members: [CAIO, BIA, ABEL, ANA],
    lastAccessAt: null,
    onlineUserIds: new Set(),
    ...overrides,
  };
}

function publicRow(masterIds: readonly string[]): PublicCampaignRow {
  const campaign = campaignPo({ visibility: 'public' });
  return {
    campaign,
    masterIds,
    masterName: 'Ana',
    masterUsername: 'ana',
    memberCount: 3,
    myRole: null,
  };
}

describe('the owner by owner_id among several masters', () => {
  it('orderedMembers puts the owner first, then the other masters by name, then the rest', () => {
    const names = orderedMembers([CAIO, BIA, ABEL, ANA]).map((member) => member.name);
    expect(names).toEqual(['Ana', 'Ágata', 'Abel', 'Caio']);
  });

  it('the detail names Ana, the owner, as master even with Bia listed before her', () => {
    const detail = toCampaignDetailDto(detailView({ members: [BIA, ANA, CAIO] }));
    expect(detail).toMatchObject({ ownerId: ANA_ID, masterName: 'Ana' });
  });

  it('the campaign info of the live table carries the owner id and the owner name', () => {
    const info = toCampaignInfoDto(toCampaignDetailDto(detailView()));
    expect(info).toMatchObject({ ownerId: ANA_ID, masterName: 'Ana' });
  });

  it('a campaign whose owner is not among its members throws citing it and the owner_id', () => {
    const view = detailView({ members: [BIA, CAIO] });
    expect(() => toCampaignDetailDto(view)).toThrow(
      `campaign ${VHARN_ID} has no member with the owner_id ${ANA_ID}`,
    );
  });

  it('the summary of the listing carries the owner id', () => {
    const summary = toCampaignSummaryDto(campaignListingRow({ campaign: campaignPo() }));
    expect(summary.ownerId).toBe(ANA_ID);
  });

  it('only Bia, a co-master, online: the card says a master is online and no player is', () => {
    const card = toPublicCampaignDto(publicRow([ANA_ID, BIA_ID]), false, new Set([BIA_ID]));
    expect(card).toMatchObject({ ownerId: ANA_ID, masterOnline: true, playersOnline: 0 });
  });

  it('two masters and Caio online: only Caio counts as a player online', () => {
    const online = new Set([ANA_ID, BIA_ID, CAIO_ID]);
    const card = toPublicCampaignDto(publicRow([ANA_ID, BIA_ID]), false, online);
    expect(card).toMatchObject({ masterOnline: true, playersOnline: 1 });
  });
});

describe('a juggernaut leaves no trace in the record of the table', () => {
  const ROOT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const ROOT = campaignMemberRow({
    userId: ROOT_ID,
    name: 'Root',
    role: 'master',
    juggernaut: true,
  });

  it('the detail lists neither Root nor counts him, even online', () => {
    const view = detailView({ members: [ANA, CAIO, ROOT], onlineUserIds: new Set([ROOT_ID]) });

    const detail = toCampaignDetailDto(view);

    expect(detail.members.map(({ userId }) => userId)).toEqual([ANA_ID, CAIO_ID]);
    expect(detail.memberCount).toBe(2);
  });

  it('the detail Root reads says he is in juggernaut mode, as master', () => {
    const membership = campaignMemberPo({
      userId: ROOT_ID,
      role: 'master',
      juggernautSince: new Date(),
    });

    const detail = toCampaignDetailDto(detailView({ members: [ANA, CAIO, ROOT], membership }));

    expect(detail).toMatchObject({ myRole: 'master', juggernaut: true });
  });

  it('a listing row with the mode on says juggernaut; one without it does not', () => {
    const on = campaignListingRow({ juggernautSince: new Date('2026-10-26T20:00:00Z') });
    expect([
      toCampaignSummaryDto(on).juggernaut,
      toCampaignSummaryDto(campaignListingRow()).juggernaut,
    ]).toEqual([true, false]);
  });
});
