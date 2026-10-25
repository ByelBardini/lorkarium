import { LEGAL_DOCUMENTS_VERSION, type AdminInvitationDto } from '@lorkarium/contracts';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { UserPo } from '../auth/users.po';
import { AccountLinkBo } from './account-link.bo';
import type { InvitationListingRow } from './invitations.dao';
import type { InvitationPo } from './invitations.po';
import type { PasswordResetPo } from './password-resets.po';

/** The address of an invitation, opened with the invitation id as context.
 *
 *  Example: `invitationEmailOf(row, cipher) // 'marina@exemplo.com'` */
export function invitationEmailOf(row: InvitationPo, cipher: DataCipherPort): string {
  return cipher.open('invitation-email', row.emailCipher, row.id);
}

/** Example: `toAdminInvitationDto(row, cipher).invitedBy // 'lucas'` */
export function toAdminInvitationDto(
  row: InvitationListingRow,
  cipher: DataCipherPort,
): AdminInvitationDto {
  return {
    id: row.id,
    email: invitationEmailOf(row, cipher),
    role: row.role,
    invitedBy: row.invitedByUsername,
    sentAt: row.sentAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export type TermsAcceptance = Pick<UserPo, 'termsAcceptedAt' | 'termsVersion'>;

/** The columns of an acceptance of the Terms of use and the Privacy policy: the version is the
 *  one in force on the server, not one the client could claim.
 *
 *  Example: `termsAcceptanceAt(now).termsVersion // '2026-10-25'` */
export function termsAcceptanceAt(now: Date): TermsAcceptance {
  return { termsAcceptedAt: now, termsVersion: LEGAL_DOCUMENTS_VERSION };
}

export function toAccountLinkBo(row: InvitationPo | PasswordResetPo): AccountLinkBo {
  return new AccountLinkBo({ id: row.id, expiresAt: row.expiresAt });
}

/** The link of a token: in the fragment, so it reaches neither a proxy log nor a `Referer`.
 *
 *  Example: `linkOf('https://mesa.example.com', '/invite', 'abc') // 'https://mesa.example.com/invite#token=abc'` */
export function linkOf(
  publicUrl: string,
  path: '/invite' | '/reset-password',
  token: string,
): string {
  return `${publicUrl}${path}#token=${encodeURIComponent(token)}`;
}
