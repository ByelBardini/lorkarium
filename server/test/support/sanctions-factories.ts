import type { AccountSanctionPo } from '../../src/modules/sanctions/account-sanctions.po';

/** A persisted measure: a warning on Caio for spam by the admin, issued 2026-11-18, no appeal.
 *
 *  Example: `accountSanctionPo({ kind: 'suspension', until })` */
export function accountSanctionPo(overrides: Partial<AccountSanctionPo> = {}): AccountSanctionPo {
  return {
    id: '5a0c7100-0000-4000-8000-000000000001',
    userId: 'ca100000-0000-4000-8000-000000000002',
    kind: 'warning',
    rule: 'spam',
    statement: 'Mandou propaganda a quem não é amigo.',
    until: null,
    reportId: null,
    issuedBy: 'ad000000-0000-4000-8000-000000000001',
    issuedAt: new Date('2026-11-18T12:00:00Z'),
    appealReceivedAt: null,
    appealOutcome: null,
    appealNote: null,
    appealDecidedBy: null,
    appealDecidedAt: null,
    deletionDueAt: null,
    deleteSharedCampaigns: false,
    notifiedAt: new Date('2026-11-18T12:00:00Z'),
    ...overrides,
  };
}
