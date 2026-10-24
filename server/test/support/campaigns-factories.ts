import type {
  CampaignMemberPo,
  NewCampaignMemberPo,
} from '../../src/modules/campaigns/campaign-members.po';
import type {
  CampaignListingRow,
  CampaignMemberRow,
} from '../../src/modules/campaigns/campaign-members.dao';
import type { CampaignPo, NewCampaignPo } from '../../src/modules/campaigns/campaigns.po';
import { ANA_ID } from './auth-factories';

export const VHARN_ID = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';
export const BIA_ID = '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f';
export const CAIO_ID = 'b4d6e8f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f';
export const QUELM_ID = '5e8d2c1b-4a3f-4b6e-9d7c-2f1a0b9c8d7e';
// Duda only watches the table (the spectator in the specs).
export const DUDA_ID = 'd7a1c3e5-2b4f-4a6c-8d0e-9f1b3c5d7e9a';

/** A campaign row as it would be inserted (no id, visibility or dates: the database fills them).
 *
 *  Example: `await campaignsDao.insert(newCampaignPo({ ownerId: ana.id }))` */
export function newCampaignPo(overrides: Partial<NewCampaignPo> = {}): NewCampaignPo {
  return { ownerId: ANA_ID, name: 'Os Sinos de Vharn', joinCode: 'VHRN7K2Q', ...overrides };
}

/** A persisted campaign row.
 *
 *  Example: `campaignPo({ passwordHash: 'hashed:sino' })` */
export function campaignPo(overrides: Partial<CampaignPo> = {}): CampaignPo {
  return {
    id: VHARN_ID,
    ownerId: ANA_ID,
    name: 'Os Sinos de Vharn',
    system: 'D&D 5e',
    status: 'recruiting',
    description: 'Um sino toca sozinho na torre de Vharn.',
    visibility: 'private',
    joinCode: 'VHRN7K2Q',
    passwordHash: null,
    activeSceneId: null,
    coverDrawing: null,
    coverTone: null,
    coverAssetId: null,
    contentWarnings: [],
    tags: [],
    createdAt: new Date('2026-10-01T12:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

/** A membership row as it would be inserted.
 *
 *  Example: `await membersDao.insert(newCampaignMemberPo({ campaignId, userId, role: 'master' }))` */
export function newCampaignMemberPo(
  overrides: Partial<NewCampaignMemberPo> = {},
): NewCampaignMemberPo {
  return { campaignId: VHARN_ID, userId: ANA_ID, role: 'player', ...overrides };
}

/** A persisted membership row.
 *
 *  Example: `campaignMemberPo({ role: 'master' })` */
export function campaignMemberPo(overrides: Partial<CampaignMemberPo> = {}): CampaignMemberPo {
  return {
    campaignId: VHARN_ID,
    userId: ANA_ID,
    role: 'master',
    joinedAt: new Date('2026-10-01T12:00:00Z'),
    lastEnteredAt: null,
    ...overrides,
  };
}

/** A row of `CampaignMembersDao.listOfUser`.
 *
 *  Example: `campaignListingRow({ role: 'player', masterName: 'Bia' })` */
export function campaignListingRow(
  overrides: Partial<CampaignListingRow> = {},
): CampaignListingRow {
  return {
    campaign: campaignPo(),
    role: 'master',
    joinedAt: new Date('2026-10-01T12:00:00Z'),
    lastEnteredAt: null,
    masterName: 'Ana',
    memberCount: 1,
    ...overrides,
  };
}

/** A row of `CampaignMembersDao.listMembers`.
 *
 *  Example: `campaignMemberRow({ userId: BIA_ID, name: 'Bia', role: 'player' })` */
export function campaignMemberRow(overrides: Partial<CampaignMemberRow> = {}): CampaignMemberRow {
  return {
    userId: ANA_ID,
    name: 'Ana',
    username: (overrides.name ?? 'ana').toLowerCase(),
    colorChoice: null,
    avatarId: null,
    bio: null,
    role: 'master',
    ...overrides,
  };
}
