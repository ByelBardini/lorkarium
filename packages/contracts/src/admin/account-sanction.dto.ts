import { z } from 'zod';
import { adminUserDto } from './admin-users.dto';

/** The scale of the use policy (§13): content removal, warning, temporary suspension, deletion. */
export const SANCTION_KINDS = ['warning', 'content_removal', 'suspension', 'ban'] as const;

export const sanctionKindDto = z.enum(SANCTION_KINDS, {
  error: (issue) =>
    `sanction kind ${JSON.stringify(issue.input)}: expected one of ${SANCTION_KINDS.join(', ')}`,
});
export type SanctionKind = z.infer<typeof sanctionKindDto>;

/** The sections of the use policy (`site/src/content/legal/uso.md`, §2 to §12) a measure can cite. */
export const SANCTION_RULES = [
  'harassment',
  'adult_content',
  'copyright',
  'ai_content',
  'sheet_code',
  'service_abuse',
  'accounts',
  'spam',
  'paid_tables',
  'security_testing',
  'reputation_reports',
  'minimum_age',
] as const;

export type SanctionRule = (typeof SANCTION_RULES)[number];

/** A section of the use policy: its number, its title and the `id` the landing gives its heading. */
export type SanctionRuleSection = Readonly<{ section: number; title: string; anchor: string }>;

// The anchors are the heading ids Astro writes (github-slugger: lowercase, accents kept, dots
// dropped); a heading renamed in uso.md must be renamed here, or the e-mail link lands at the top.
/** What the e-mail and the backoffice show of each rule; the link is `/uso/#<anchor>` on the landing.
 *
 *  Example: `SANCTION_RULE_SECTIONS.spam.title // 'Spam e divulgação'` */
export const SANCTION_RULE_SECTIONS: Readonly<Record<SanctionRule, SanctionRuleSection>> = {
  harassment: { section: 2, title: 'Respeito às pessoas', anchor: '2-respeito-às-pessoas' },
  adult_content: {
    section: 3,
    title: 'Temas pesados e conteúdo adulto',
    anchor: '3-temas-pesados-e-conteúdo-adulto',
  },
  copyright: {
    section: 4,
    title: 'Direitos autorais e livros de RPG',
    anchor: '4-direitos-autorais-e-livros-de-rpg',
  },
  ai_content: { section: 5, title: 'Conteúdo gerado por IA', anchor: '5-conteúdo-gerado-por-ia' },
  sheet_code: { section: 6, title: 'Fichas com código', anchor: '6-fichas-com-código' },
  service_abuse: { section: 7, title: 'Uso do serviço', anchor: '7-uso-do-serviço' },
  accounts: { section: 8, title: 'Contas', anchor: '8-contas' },
  spam: { section: 9, title: 'Spam e divulgação', anchor: '9-spam-e-divulgação' },
  paid_tables: { section: 10, title: 'Mesa paga', anchor: '10-mesa-paga' },
  security_testing: {
    section: 11,
    title: 'Falhas de segurança',
    anchor: '11-falhas-de-segurança',
  },
  reputation_reports: {
    section: 12,
    title: 'Reputação e denúncias',
    anchor: '12-reputação-e-denúncias',
  },
  // The 18+ rule lives in the accounts section: a ban for it keeps no e-mail index.
  minimum_age: { section: 8, title: 'Idade mínima', anchor: '8-contas' },
};

export const sanctionRuleDto = z.enum(SANCTION_RULES, {
  error: (issue) =>
    `sanction rule ${JSON.stringify(issue.input)}: expected one of ${SANCTION_RULES.join(', ')}`,
});

/** The text the person reads: the facts behind the measure (DSA-style statement of reasons). */
export const SANCTION_STATEMENT_MAX_LENGTH = 2000;
export const APPEAL_NOTE_MAX_LENGTH = 2000;

function requiredText(max: number, field: string) {
  return z
    .string()
    .trim()
    .min(1, { error: `${field} is empty: expected 1 to ${max} characters` })
    .max(max, { error: `${field} is too long: expected at most ${max} characters` });
}

/** Body of `POST /api/admin/users/:userId/sanctions`. `until` (the end of a suspension, absent =
 *  no deadline) only with `suspension`; the server refuses an end that is not ahead.
 *  `includeSharedCampaigns` (only with `ban`) lets the scheduled deletion take the tables the
 *  account owns with other members. The target comes from the URL and the author from the
 *  session (strict).
 *
 *  Example: `issueSanctionRequestDto.parse({ kind: 'warning', rule: 'spam', statement: 'x' })` */
export const issueSanctionRequestDto = z
  .strictObject({
    kind: sanctionKindDto,
    rule: sanctionRuleDto,
    statement: requiredText(SANCTION_STATEMENT_MAX_LENGTH, 'statement'),
    until: z.iso.datetime({ offset: true }).optional(),
    reportId: z.uuid().optional(),
    includeSharedCampaigns: z.boolean().optional(),
  })
  .superRefine((body, context) => {
    if (body.until !== undefined && body.kind !== 'suspension')
      context.addIssue({
        code: 'custom',
        path: ['until'],
        message: `until ${body.until} on a ${body.kind}: expected an end only with a suspension`,
      });
    if (body.includeSharedCampaigns !== undefined && body.kind !== 'ban')
      context.addIssue({
        code: 'custom',
        path: ['includeSharedCampaigns'],
        message: `includeSharedCampaigns on a ${body.kind}: expected it only with a ban`,
      });
  });

export type IssueSanctionRequestDto = z.infer<typeof issueSanctionRequestDto>;

export const APPEAL_OUTCOMES = ['upheld', 'reverted'] as const;

export const appealOutcomeDto = z.enum(APPEAL_OUTCOMES);
export type AppealOutcome = z.infer<typeof appealOutcomeDto>;

/** Body of `PUT /api/admin/sanctions/:sanctionId/appeal`: the appeal arrived (`received`), or the
 *  review's decision with the note of why (`upheld` keeps the measure, `reverted` undoes it).
 *
 *  Example: `recordAppealRequestDto.parse({ outcome: 'reverted', note: 'Engano.' })` */
export const recordAppealRequestDto = z.union([
  z.strictObject({ outcome: z.literal('received') }),
  z.strictObject({
    outcome: appealOutcomeDto,
    note: requiredText(APPEAL_NOTE_MAX_LENGTH, 'note'),
  }),
]);

export type RecordAppealRequestDto = z.infer<typeof recordAppealRequestDto>;

/** The appeal of a measure: when it arrived and, once reviewed, the outcome, the note, who decided
 *  (the @, `null` once that account is gone) and when. */
export const sanctionAppealDto = z.strictObject({
  receivedAt: z.iso.datetime(),
  outcome: appealOutcomeDto.nullable(),
  note: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
});

export type SanctionAppealDto = z.infer<typeof sanctionAppealDto>;

/** A measure in the account's history (only the backoffice reads it). `issuedBy` is the admin's @,
 *  `null` once that account is gone; `appeal` is `null` until an appeal arrives. `deletionDueAt`:
 *  when a ban deletes the account (it suspends at once and deletes after the appeal window);
 *  `null` on the other kinds and on a ban that was reverted or lifted. */
export const accountSanctionDto = z.strictObject({
  id: z.uuid(),
  kind: sanctionKindDto,
  rule: sanctionRuleDto,
  statement: z.string(),
  until: z.iso.datetime().nullable(),
  deletionDueAt: z.iso.datetime().nullable(),
  reportId: z.uuid().nullable(),
  issuedBy: z.string().nullable(),
  issuedAt: z.iso.datetime(),
  appeal: sanctionAppealDto.nullable(),
});

export type AccountSanctionDto = z.infer<typeof accountSanctionDto>;

/** Response of `GET /api/admin/users/:userId/sanctions`, the newest first. */
export const accountSanctionsResponseDto = z.strictObject({
  sanctions: z.array(accountSanctionDto),
});

export type AccountSanctionsResponseDto = z.infer<typeof accountSanctionsResponseDto>;

/** Response of a measure (201) and of an appeal (200): the measure and the account as it is now (a
 *  suspension or a ban suspends it; the ban's deletion comes later, at `deletionDueAt`). */
export const sanctionResponseDto = z.strictObject({
  sanction: accountSanctionDto,
  user: adminUserDto,
});

export type SanctionResponseDto = z.infer<typeof sanctionResponseDto>;

/** Params of `/api/admin/sanctions/:sanctionId/*`. */
export const sanctionParamsDto = z.strictObject({ sanctionId: z.uuid() });
