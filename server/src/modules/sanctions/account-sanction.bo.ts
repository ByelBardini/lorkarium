import { UserAccessBo } from '../auth/user-access.bo';
import type { UserPo } from '../auth/users.po';
import { requireOtherAccount } from '../user-admin/user-admin.bo';
import type { AccountSanctionPo } from './account-sanctions.po';
import {
  AlreadySuspendedError,
  AppealAlreadyDecidedError,
  SanctionUntilPastError,
  TargetIsAdminError,
} from './sanctions.error';

// The e-mail of an account deleted for a violation is refused for 5 years (use policy §8: no new
// account to dodge a ban); the two extra days cover the leap years.
export const BANNED_EMAIL_KEPT_MS = (5 * 365 + 2) * 24 * 60 * 60_000;

/** The instant before which a ban has lapsed: a ban kept after it still refuses the e-mail.
 *
 *  Example: `banLapseCutOf(new Date('2026-11-19T00:00:00Z')) // 2021-11-17T00:00:00.000Z` */
export function banLapseCutOf(now: Date): Date {
  return new Date(now.getTime() - BANNED_EMAIL_KEPT_MS);
}

type SanctionKind = AccountSanctionPo['kind'];
type AppealOutcome = NonNullable<AccountSanctionPo['appealOutcome']>;

/** An appeal step as the rule reads it: the arrival, or a decision with its note. */
export type AppealStep =
  Readonly<{ outcome: 'received' }> | Readonly<{ outcome: AppealOutcome; note: string }>;

/** The account a measure targets, as the rule needs it. */
export type SanctionTarget = Pick<UserPo, 'id' | 'role' | 'suspendedAt' | 'suspendedUntil'>;

export type SanctionRequest = Readonly<{ kind: SanctionKind; until: Date | null }>;

/** Whether `actorId` may apply the measure to `target` at `now`: never on oneself nor on an admin;
 *  a suspension needs an account not suspended now and an end (if any) after now. A warning or a
 *  content removal only records, so it goes on a suspended account too.
 *
 *  Example: `requireSanctionable(admin.id, caio, { kind: 'suspension', until: null }, now)` */
export function requireSanctionable(
  actorId: string,
  target: SanctionTarget,
  request: SanctionRequest,
  now: Date,
): void {
  requireOtherAccount(actorId, target.id, 'apply a measure to');
  if (target.role === 'admin') throw new TargetIsAdminError(target.id);
  if (request.kind !== 'suspension') return;
  if (target.suspendedAt && new UserAccessBo(target).isSuspendedAt(now))
    throw new AlreadySuspendedError(target.id, target.suspendedAt);
  if (request.until && request.until.getTime() <= now.getTime())
    throw new SanctionUntilPastError(request.until, now);
}

/** The columns an appeal step writes. */
export type AppealChange = Readonly<{
  appealReceivedAt: Date;
  appealOutcome?: AppealOutcome;
  appealNote?: string;
  appealDecidedBy?: string;
  appealDecidedAt?: Date;
}>;

type AppealState = Pick<AccountSanctionPo, 'id' | 'appealReceivedAt' | 'appealOutcome'>;

/** The arrival (the first date stays: the 15 days count from it) or the decision of an appeal; a
 *  decision without a recorded arrival takes now as the arrival. A decided appeal is final.
 *
 *  Example: `appealChangeOf(sanction, { outcome: 'received' }, admin.id, now) // { appealReceivedAt: now }` */
export function appealChangeOf(
  sanction: AppealState,
  request: AppealStep,
  deciderId: string,
  now: Date,
): AppealChange {
  if (sanction.appealOutcome !== null)
    throw new AppealAlreadyDecidedError(sanction.id, sanction.appealOutcome);
  const appealReceivedAt = sanction.appealReceivedAt ?? now;
  if (request.outcome === 'received') return { appealReceivedAt };
  return {
    appealReceivedAt,
    appealOutcome: request.outcome,
    appealNote: request.note,
    appealDecidedBy: deciderId,
    appealDecidedAt: now,
  };
}

/** A reverted suspension ends the suspension only when it is the account's latest one and still
 *  holds; an older one, an ended one or any other kind is only recorded.
 *
 *  Example: `liftsSuspension(sanction, 'reverted', latestId, caio, now) // true` */
export function liftsSuspension(
  sanction: Pick<AccountSanctionPo, 'id' | 'kind'>,
  outcome: AppealOutcome | 'received',
  latestSuspensionId: string | null,
  target: SanctionTarget,
  now: Date,
): boolean {
  if (outcome !== 'reverted' || sanction.kind !== 'suspension') return false;
  return sanction.id === latestSuspensionId && new UserAccessBo(target).isSuspendedAt(now);
}
