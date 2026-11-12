import type { PlanLimits } from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { viewerAccessOf } from '../campaigns/member-access';
import type { LibraryRequester } from '../library/library.service';
import { effectiveLimitsOf } from '../plans/plan-limits.bo';
import type { SheetsDao } from './sheets.dao';

type MembersReader = Pick<CampaignMembersDao, 'findMembership'>;

/** What a write locked: always what the requester may do; the table also gives the owner's plan. */
export type LockedSheet = Readonly<{ access: CampaignAccessBo }>;
/** The table locked for a write: what the requester may do and the limits of the owner's plan. */
export type LockedTable = LockedSheet & Readonly<{ limits: PlanLimits }>;

export type SheetLockDaos = Readonly<{
  campaigns: Pick<CampaignsDao, 'lockWithOwner'>;
  members: MembersReader;
  sheets: Pick<SheetsDao, 'lockById'>;
}>;

/** Reads the membership outside (`read`, the cheap refusal), locks the table reading the owner's
 *  plan with it, then reads the membership again under the lock.
 *
 *  Example: `const { access, limits } = await lockedTableOf(deps.read.members, daos, requester)` */
export async function lockedTableOf(
  read: MembersReader,
  daos: SheetLockDaos,
  requester: LibraryRequester,
): Promise<LockedTable> {
  await viewerAccessOf(read, requester.campaignId, requester.userId);
  const table = await daos.campaigns.lockWithOwner(requester.campaignId);
  if (!table) throw new CampaignNotFoundError(requester);
  const access = await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
  return { access, limits: effectiveLimitsOf(table.owner) };
}

/** Like `lockedTableOf`, for a values write: locks only the row of `sheetId` (an unknown one locks
 *  nothing and the scope refuses it), so the write never waits on the table; a values write
 *  counts nothing against the plan.
 *
 *  Example: `const { access } = await lockedSheetOf(deps.read.members, daos, requester, sheetId)` */
export async function lockedSheetOf(
  read: MembersReader,
  daos: SheetLockDaos,
  requester: LibraryRequester,
  sheetId: string,
): Promise<LockedSheet> {
  await viewerAccessOf(read, requester.campaignId, requester.userId);
  await daos.sheets.lockById(requester.campaignId, sheetId);
  return { access: await viewerAccessOf(daos.members, requester.campaignId, requester.userId) };
}
