import type { AdminUserDto, UserDeletionCheckDto } from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { DeletionVerdict } from './user-admin.bo';
import type { AccountListingRow } from './user-admin.dao';

/** An account for the backoffice: the e-mail opened with the id as context, the status from
 *  `suspended_at`, the effective color. Never the hash nor the sealed columns.
 *
 *  Example: `toAdminUserDto(row, cipher).status // 'suspended'` */
export function toAdminUserDto(row: AccountListingRow, cipher: DataCipherPort): AdminUserDto {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: cipher.open('user-email', row.emailCipher, row.id),
    role: row.role,
    status: row.suspendedAt === null ? 'active' : 'suspended',
    color: memberColorOf(row.id, row.color),
    avatarId: row.avatarId,
    campaignCount: row.campaignCount,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Example: `toDeletionCheckDto({ kind: 'allowed', soloCampaigns: 2 }) // { blockingCampaigns: [], soloCampaigns: 2 }` */
export function toDeletionCheckDto(verdict: DeletionVerdict): UserDeletionCheckDto {
  if (verdict.kind === 'allowed')
    return { blockingCampaigns: [], soloCampaigns: verdict.soloCampaigns };
  return { blockingCampaigns: [...verdict.blockingCampaigns], soloCampaigns: 0 };
}
