import {
  feedbackRequestDto,
  screenshotResponseDto,
  type FeedbackRequestDto,
  type ScreenshotDto,
} from '@lorkarium/contracts';
import {
  commandFailureOf,
  type AccountCommonFailure,
  type AccountResult,
  type ScreenshotUploadFailure,
} from './account-failure';
import { callApi, callUpload, parseOk } from './api-call';
import type { HttpTransport } from './http-transport';

/** A feedback refused: 10 already waiting (409), a screenshot that is not one the sender sent
 *  loose, or a suspended account. */
export type FeedbackFailure =
  | AccountCommonFailure
  | Readonly<{ kind: 'open_limit' }>
  | Readonly<{ kind: 'attachment_not_found' }>
  | Readonly<{ kind: 'forbidden' }>;

/** A screenshot sent for a feedback: past 5 MiB, or not a PNG, JPEG or WebP. */
export type FeedbackAttachmentFailure = ScreenshotUploadFailure;

/** The sender's side of the bug reports and suggestions; failures come back as values.
 *
 *  Example: `const result = await feedbackApi.send(request); if (!result.ok) result.failure.kind` */
export interface FeedbackApi {
  send(request: FeedbackRequestDto): Promise<AccountResult<null, FeedbackFailure>>;
  /** One screenshot, sent alone before the feedback that cites its id. */
  uploadAttachment(file: Blob): Promise<AccountResult<ScreenshotDto, FeedbackAttachmentFailure>>;
}

const SEND_FAILURE_BY_CODE = {
  FEEDBACK_OPEN_LIMIT: { kind: 'open_limit' },
  ATTACHMENT_NOT_FOUND: { kind: 'attachment_not_found' },
  FEEDBACK_FORBIDDEN: { kind: 'forbidden' },
} as const;

const ATTACHMENT_FAILURE_BY_CODE = {
  ATTACHMENT_TOO_LARGE: { kind: 'attachment_too_large' },
  UNSUPPORTED_IMAGE: { kind: 'unsupported_image' },
} as const;

/** `FeedbackApi` over HTTP: the body passes `feedbackRequestDto` before it leaves.
 *
 *  Example: `await new HttpFeedbackApi(transport).send(request)` */
export class HttpFeedbackApi implements FeedbackApi {
  constructor(private readonly transport: HttpTransport) {}

  async send(request: FeedbackRequestDto): Promise<AccountResult<null, FeedbackFailure>> {
    const body = feedbackRequestDto.parse(request);
    const call = await callApi(this.transport, 'POST', '/feedback', body);
    if (call.kind === 'ok') return { ok: true, value: null };
    return { ok: false, failure: commandFailureOf(call, SEND_FAILURE_BY_CODE) };
  }

  async uploadAttachment(
    file: Blob,
  ): Promise<AccountResult<ScreenshotDto, FeedbackAttachmentFailure>> {
    const call = await callUpload(this.transport, '/feedback/attachments', file);
    if (call.kind === 'ok')
      return parseOk(screenshotResponseDto, call.body, (body) => body.attachment);
    return { ok: false, failure: commandFailureOf(call, ATTACHMENT_FAILURE_BY_CODE) };
  }
}
