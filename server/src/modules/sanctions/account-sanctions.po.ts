import {
  APPEAL_NOTE_MAX_LENGTH,
  APPEAL_OUTCOMES,
  SANCTION_KINDS,
  SANCTION_RULES,
  SANCTION_STATEMENT_MAX_LENGTH,
} from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';
import { userReports } from '../reports/user-reports.po';

export const sanctionKind = pgEnum('sanction_kind', SANCTION_KINDS);
export const sanctionRule = pgEnum('sanction_rule', SANCTION_RULES);
export const appealOutcome = pgEnum('appeal_outcome', APPEAL_OUTCOMES);

// A measure against an account (use policy §13), with the rule, the reasons the person read and
// the appeal (§14). It goes with the account: a ban leaves only the banned e-mail index behind.
export const accountSanctions = pgTable(
  'account_sanctions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: sanctionKind('kind').notNull(),
    rule: sanctionRule('rule').notNull(),
    statement: text('statement').notNull(),
    // The end of a suspension; null = no deadline (and always null on the other kinds).
    until: timestamp('until', { withTimezone: true }),
    reportId: uuid('report_id').references(() => userReports.id, { onDelete: 'set null' }),
    issuedBy: uuid('issued_by').references(() => users.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    // The proof of the 15 days of §14: when the appeal arrived and when it was decided.
    appealReceivedAt: timestamp('appeal_received_at', { withTimezone: true }),
    appealOutcome: appealOutcome('appeal_outcome'),
    appealNote: text('appeal_note'),
    appealDecidedBy: uuid('appeal_decided_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    appealDecidedAt: timestamp('appeal_decided_at', { withTimezone: true }),
  },
  (table) => [
    index('account_sanctions_user_issued_idx').on(table.userId, table.issuedAt),
    check(
      'account_sanctions_statement_length',
      sql`char_length(${table.statement}) BETWEEN 1 AND ${sql.raw(String(SANCTION_STATEMENT_MAX_LENGTH))}`,
    ),
    check(
      'account_sanctions_until_only_suspension',
      sql`${table.until} IS NULL OR ${table.kind} = 'suspension'`,
    ),
    check(
      'account_sanctions_appeal_note_length',
      sql`char_length(${table.appealNote}) <= ${sql.raw(String(APPEAL_NOTE_MAX_LENGTH))}`,
    ),
    // A decision comes whole (outcome, note, when) and only after the appeal arrived; who decided
    // is left out on purpose: it turns null when that admin's account is deleted.
    check(
      'account_sanctions_appeal_decision_whole',
      sql`(${table.appealOutcome} IS NULL) = (${table.appealNote} IS NULL) AND (${table.appealOutcome} IS NULL) = (${table.appealDecidedAt} IS NULL)`,
    ),
    check(
      'account_sanctions_appeal_received_first',
      sql`${table.appealOutcome} IS NULL OR ${table.appealReceivedAt} IS NOT NULL`,
    ),
  ],
);

export type AccountSanctionPo = typeof accountSanctions.$inferSelect;
export type NewAccountSanctionPo = typeof accountSanctions.$inferInsert;
