import {
  LEGAL_DOCUMENTS_VERSION,
  type AdminInvitationDto,
  type InvitationOriginDto,
} from '@lorkarium/contracts';
import { invitationMail, signUpLinkMail } from '../account-security/admin-mail.mapper';
import type { MailMessage } from '../account-security/mailer.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { UserPo } from '../auth/users.po';
import { AccountLinkBo, invitationTtlOf } from './account-link.bo';
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
  path: '/invite' | '/sign-up/confirm' | '/reset-password',
  token: string,
): string {
  return `${publicUrl}${path}#token=${encodeURIComponent(token)}`;
}

/** The link of an invitation: the sign-up's has its own page (the invitation's text asks whoever
 *  invited for a new one).
 *
 *  Example: `invitationLinkOf(url, 'self', 'abc') // 'https://…/sign-up/confirm#token=abc'` */
export function invitationLinkOf(
  publicUrl: string,
  origin: InvitationOriginDto,
  token: string,
): string {
  return linkOf(publicUrl, origin === 'self' ? '/sign-up/confirm' : '/invite', token);
}

export type InvitationMailTarget = Readonly<{ to: string; link: string; publicUrl: string }>;

/** The e-mail of an invitation's link, by who asked for it: the admin's invitation or the
 *  sign-up's confirmation, each with its own validity.
 *
 *  Example: `invitationMailOf('self', { to, link, publicUrl }).subject // 'Confirme seu cadastro no Lorkarium'` */
export function invitationMailOf(
  origin: InvitationOriginDto,
  target: InvitationMailTarget,
): MailMessage {
  if (origin === 'self') {
    return signUpLinkMail({ ...target, validFor: { hours: invitationTtlOf('self') / HOUR_MS } });
  }
  return invitationMail({ ...target, validFor: { days: invitationTtlOf('admin') / DAY_MS } });
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
