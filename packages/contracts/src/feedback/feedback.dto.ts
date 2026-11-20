import { z } from 'zod';
import { screenshotDto, screenshotIdsDto } from '../screenshots/screenshot.dto';

/** A bug report or a suggestion, mirroring the repository's issue forms. */
export const FEEDBACK_KINDS = ['bug', 'suggestion'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Where the sender was: a browser or the Windows app. */
export const FEEDBACK_PLATFORMS = ['browser', 'desktop'] as const;
export type FeedbackPlatform = (typeof FEEDBACK_PLATFORMS)[number];

export const FEEDBACK_TEXT_MAX_LENGTH = 2000;
export const FEEDBACK_APP_VERSION_MAX_LENGTH = 100;
/** Entries one account may have waiting in the queue at once. */
export const FEEDBACK_OPEN_LIMIT = 10;
export const FEEDBACK_PAGE_SIZE = 50;
/** GitHub's own limits of an issue's title and body. */
export const FEEDBACK_ISSUE_TITLE_MAX_LENGTH = 256;
export const FEEDBACK_ISSUE_BODY_MAX_LENGTH = 65536;

function requiredText(section: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, { error: `${section} is empty: expected some text` })
    .max(max, { error: `${section} is longer than ${max} characters` });
}

const optionalText = z
  .string()
  .trim()
  .max(FEEDBACK_TEXT_MAX_LENGTH, {
    error: `alternatives is longer than ${FEEDBACK_TEXT_MAX_LENGTH} characters`,
  })
  .transform((text) => (text === '' ? null : text))
  .nullable()
  .default(null);

/** The sections of a bug (`bug.yml`): the steps, what was expected and what happened. */
export const bugFeedbackContentDto = z.strictObject({
  kind: z.literal('bug'),
  steps: requiredText('steps', FEEDBACK_TEXT_MAX_LENGTH),
  expected: requiredText('expected', FEEDBACK_TEXT_MAX_LENGTH),
  actual: requiredText('actual', FEEDBACK_TEXT_MAX_LENGTH),
});

/** The sections of a suggestion (`sugestao.yml`): the problem, the idea and, optionally, what was
 *  already tried (only spaces become `null`). */
export const suggestionFeedbackContentDto = z.strictObject({
  kind: z.literal('suggestion'),
  problem: requiredText('problem', FEEDBACK_TEXT_MAX_LENGTH),
  idea: requiredText('idea', FEEDBACK_TEXT_MAX_LENGTH),
  alternatives: optionalText,
});

export const feedbackContentDto = z.discriminatedUnion('kind', [
  bugFeedbackContentDto,
  suggestionFeedbackContentDto,
]);
export type FeedbackContentDto = z.infer<typeof feedbackContentDto>;

export const feedbackPlatformDto = z.enum(FEEDBACK_PLATFORMS, {
  error: (issue) =>
    `platform ${JSON.stringify(issue.input)}: expected one of ${FEEDBACK_PLATFORMS.join(', ')}`,
});

/** Body of `POST /api/feedback`: the sections of its kind, where it happened and the ids of up to
 *  5 screenshots sent first. The sender comes from the session (strict).
 *
 *  Example: `feedbackRequestDto.parse({ content: { kind: 'bug', steps, expected, actual }, platform: 'browser', appVersion: 'Chrome 142' })` */
export const feedbackRequestDto = z.strictObject({
  content: feedbackContentDto,
  platform: feedbackPlatformDto,
  appVersion: requiredText('appVersion', FEEDBACK_APP_VERSION_MAX_LENGTH),
  attachmentIds: screenshotIdsDto.optional(),
});
export type FeedbackRequestDto = z.infer<typeof feedbackRequestDto>;

/** The issue as the server drafts it from an entry; the admin edits it before it goes public. */
export const feedbackIssueDraftDto = z.strictObject({ title: z.string(), body: z.string() });
export type FeedbackIssueDraftDto = z.infer<typeof feedbackIssueDraftDto>;

/** An entry in the backoffice queue, never shown back to the sender. `sender.username` is the @
 *  of when it was sent. */
export const feedbackEntryDto = z.strictObject({
  id: z.uuid(),
  content: feedbackContentDto,
  platform: feedbackPlatformDto,
  appVersion: z.string(),
  sender: z.strictObject({ id: z.uuid(), username: z.string() }),
  attachments: z.array(screenshotDto),
  draft: feedbackIssueDraftDto,
  createdAt: z.iso.datetime(),
});
export type FeedbackEntryDto = z.infer<typeof feedbackEntryDto>;

/** Query of `GET /api/admin/feedback`: pages from 1 (only waiting entries exist).
 *
 *  Example: `listFeedbackQueryDto.parse({ page: '2' }) // { page: 2 }` */
export const listFeedbackQueryDto = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
});
export type ListFeedbackQueryDto = z.infer<typeof listFeedbackQueryDto>;

/** Response of `GET /api/admin/feedback`: one page, oldest first, and the total waiting. */
export const feedbackPageDto = z.strictObject({
  entries: z.array(feedbackEntryDto),
  page: z.int().min(1),
  pageSize: z.int().positive(),
  total: z.int().nonnegative(),
});
export type FeedbackPageDto = z.infer<typeof feedbackPageDto>;

/** Params of `POST /api/admin/feedback/:feedbackId/{publish,archive}`. */
export const feedbackParamsDto = z.strictObject({ feedbackId: z.uuid() });

/** Params of `GET /api/admin/feedback/:feedbackId/attachments/:attachmentId`. */
export const feedbackAttachmentParamsDto = z.strictObject({
  feedbackId: z.uuid(),
  attachmentId: z.uuid(),
});

/** Body of `POST /api/admin/feedback/:feedbackId/publish`: the title and body as the admin left
 *  them, within GitHub's limits.
 *
 *  Example: `publishFeedbackRequestDto.parse({ title: '[bug] Token volta', body })` */
export const publishFeedbackRequestDto = z.strictObject({
  title: requiredText('title', FEEDBACK_ISSUE_TITLE_MAX_LENGTH),
  body: requiredText('body', FEEDBACK_ISSUE_BODY_MAX_LENGTH),
});
export type PublishFeedbackRequestDto = z.infer<typeof publishFeedbackRequestDto>;

/** Response of the publish: the issue that now exists on GitHub. */
export const publishFeedbackResponseDto = z.strictObject({
  issueUrl: z.url({ protocol: /^https$/, hostname: /^github\.com$/ }),
  issueNumber: z.int().positive(),
});
export type PublishFeedbackResponseDto = z.infer<typeof publishFeedbackResponseDto>;
