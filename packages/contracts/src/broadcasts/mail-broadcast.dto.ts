import { z } from 'zod';
import { BILLING_PLANS } from '../billing/billing.dto';

export const MAIL_BROADCAST_SUBJECT_MAX_LENGTH = 120;
export const MAIL_BROADCAST_TITLE_MAX_LENGTH = 80;
export const MAIL_BROADCAST_PARAGRAPHS_MAX = 20;
export const MAIL_BROADCAST_PARAGRAPH_MAX_LENGTH = 2000;
export const MAIL_BROADCAST_BUTTON_LABEL_MAX_LENGTH = 40;
export const MAIL_BROADCAST_LINK_MAX_LENGTH = 2000;

/** Who gets a service notice: every active account, whoever has a paid plan in force, or only
 *  the holders of one plan on sale (a price change of the Lenda goes to who pays the Lenda).
 *
 *  Example: `mailBroadcastSegmentDto.parse({ plan: 'lenda' })` */
export const mailBroadcastSegmentDto = z.union([
  z.literal('all'),
  z.literal('paid'),
  z.strictObject({ plan: z.enum(BILLING_PLANS) }),
]);

export type MailBroadcastSegmentDto = z.infer<typeof mailBroadcastSegmentDto>;

function trimmedText(max: number) {
  return z.string().trim().min(1).max(max);
}

// The button is the only link the admin writes into the mail: only https, never a script.
const httpsLinkDto = z
  .string()
  .trim()
  .max(MAIL_BROADCAST_LINK_MAX_LENGTH)
  .pipe(
    z.url({
      protocol: /^https$/,
      error: (issue) => `link ${JSON.stringify(issue.input)}: expected an https:// address`,
    }),
  );

export const mailBroadcastButtonDto = z.strictObject({
  label: trimmedText(MAIL_BROADCAST_BUTTON_LABEL_MAX_LENGTH),
  href: httpsLinkDto,
});

export type MailBroadcastButtonDto = z.infer<typeof mailBroadcastButtonDto>;

/** What the admin writes: the segment, the subject, the title, 1 to 20 paragraphs and an optional
 *  button. Body of `POST /api/admin/broadcasts`, `PUT …/:broadcastId` and `POST …/preview`.
 *
 *  Example: `mailBroadcastContentDto.parse({ segment: 'paid', subject: 'Preços', title: 'Preços', paragraphs: ['…'] })` */
export const mailBroadcastContentDto = z.strictObject({
  segment: mailBroadcastSegmentDto,
  subject: trimmedText(MAIL_BROADCAST_SUBJECT_MAX_LENGTH),
  title: trimmedText(MAIL_BROADCAST_TITLE_MAX_LENGTH),
  paragraphs: z
    .array(trimmedText(MAIL_BROADCAST_PARAGRAPH_MAX_LENGTH))
    .min(1)
    .max(MAIL_BROADCAST_PARAGRAPHS_MAX),
  button: mailBroadcastButtonDto.optional(),
});

export type MailBroadcastContentDto = z.infer<typeof mailBroadcastContentDto>;
export type MailBroadcastContentInput = z.input<typeof mailBroadcastContentDto>;

/** Body of `POST /api/admin/broadcasts/audience`: the segment being chosen in the editor. */
export const mailBroadcastAudienceRequestDto = z.strictObject({ segment: mailBroadcastSegmentDto });

export type MailBroadcastAudienceRequestDto = z.infer<typeof mailBroadcastAudienceRequestDto>;

/** How many accounts the segment reaches right now (the confirmation freezes its own count). */
export const mailBroadcastAudienceDto = z.strictObject({ audience: z.int().nonnegative() });

export type MailBroadcastAudienceDto = z.infer<typeof mailBroadcastAudienceDto>;

/** Response of `POST /api/admin/broadcasts/preview`: the mail as the server renders it and how
 *  many accounts the segment reaches right now. */
export const mailBroadcastPreviewDto = z.strictObject({
  subject: z.string(),
  html: z.string(),
  audience: z.int().nonnegative(),
});

export type MailBroadcastPreviewDto = z.infer<typeof mailBroadcastPreviewDto>;

/** One notice of the backoffice. `total` is null until the confirmation freezes the audience;
 *  `sent`, `failed` and `skipped` (the account deleted before its turn) count the deliveries. */
export const mailBroadcastDto = z.strictObject({
  id: z.uuid(),
  segment: mailBroadcastSegmentDto,
  subject: z.string(),
  title: z.string(),
  paragraphs: z.array(z.string()),
  button: mailBroadcastButtonDto.nullable(),
  createdAt: z.iso.datetime(),
  testedAt: z.iso.datetime().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  total: z.int().nonnegative().nullable(),
  sent: z.int().nonnegative(),
  failed: z.int().nonnegative(),
  skipped: z.int().nonnegative(),
});

export type MailBroadcastDto = z.infer<typeof mailBroadcastDto>;

/** Response of `GET /api/admin/broadcasts`, the newest first. */
export const mailBroadcastsResponseDto = z.strictObject({ broadcasts: z.array(mailBroadcastDto) });

export type MailBroadcastsResponseDto = z.infer<typeof mailBroadcastsResponseDto>;

/** Response of creating or rewriting a draft: the draft and the segment's audience right now. */
export const mailBroadcastDraftResponseDto = z.strictObject({
  broadcast: mailBroadcastDto,
  audience: z.int().nonnegative(),
});

export type MailBroadcastDraftResponseDto = z.infer<typeof mailBroadcastDraftResponseDto>;

/** Response of `POST …/:broadcastId/test`: the draft (now tested) and the admin's own address. */
export const mailBroadcastTestResponseDto = z.strictObject({
  broadcast: mailBroadcastDto,
  to: z.email(),
});

export type MailBroadcastTestResponseDto = z.infer<typeof mailBroadcastTestResponseDto>;

export const mailBroadcastParamsDto = z.strictObject({ broadcastId: z.uuid() });

/** Body of `POST …/:broadcastId/confirm`: the audience typed by hand, as a last lock.
 *
 *  Example: `confirmMailBroadcastRequestDto.parse({ total: 1240 })` */
export const confirmMailBroadcastRequestDto = z.strictObject({ total: z.int().min(1) });

export type ConfirmMailBroadcastRequestDto = z.infer<typeof confirmMailBroadcastRequestDto>;

/** Response of the confirmation: the notice with its frozen `total`. */
export const mailBroadcastResponseDto = z.strictObject({ broadcast: mailBroadcastDto });

export type MailBroadcastResponseDto = z.infer<typeof mailBroadcastResponseDto>;
