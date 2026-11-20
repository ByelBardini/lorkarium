import {
  apiErrorDto,
  feedbackPageDto,
  listFeedbackQueryDto,
  publishFeedbackRequestDto,
  publishFeedbackResponseDto,
  type FeedbackPageDto,
  type ListFeedbackQueryDto,
  type PublishFeedbackRequestDto,
  type PublishFeedbackResponseDto,
} from '@lorkarium/contracts';
import { callApi, parseOk, type ApiCall } from './api-call';
import type { HttpTransport } from './http-transport';
import { userAdminFailureOf, type UserAdminFailure } from './user-admin-api';

/** The backoffice's failures, plus GitHub not answering (502) or not set up on the server (503). */
export type FeedbackAdminFailure =
  | UserAdminFailure
  | Readonly<{ kind: 'issue_tracker_unavailable' }>
  | Readonly<{ kind: 'issue_tracker_not_configured' }>;

export type FeedbackAdminResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: FeedbackAdminFailure }>;

/** The backoffice queue of the feedback (`/api/admin/feedback`); failures come back as values.
 *
 *  Example: `await feedbackAdminApi.publish(entryId, { title, body }) // { ok: true, value: { issueUrl, issueNumber } }` */
export interface FeedbackAdminApi {
  list(query: ListFeedbackQueryDto): Promise<FeedbackAdminResult<FeedbackPageDto>>;
  publish(
    entryId: string,
    request: PublishFeedbackRequestDto,
  ): Promise<FeedbackAdminResult<PublishFeedbackResponseDto>>;
  archive(entryId: string): Promise<FeedbackAdminResult<null>>;
}

const TRACKER_FAILURE_BY_CODE: Readonly<Record<string, FeedbackAdminFailure>> = {
  ISSUE_TRACKER_UNAVAILABLE: { kind: 'issue_tracker_unavailable' },
  ISSUE_TRACKER_NOT_CONFIGURED: { kind: 'issue_tracker_not_configured' },
};

/** `FeedbackAdminApi` over HTTP: the query and body pass their DTO before leaving, the answers after.
 *
 *  Example: `await new HttpFeedbackAdminApi(transport).list({ page: 1 })` */
export class HttpFeedbackAdminApi implements FeedbackAdminApi {
  constructor(private readonly transport: HttpTransport) {}

  async list(query: ListFeedbackQueryDto): Promise<FeedbackAdminResult<FeedbackPageDto>> {
    const { page } = listFeedbackQueryDto.parse(query);
    const call = await callApi(this.transport, 'GET', `/admin/feedback?page=${page}`);
    if (call.kind !== 'ok') return { ok: false, failure: feedbackAdminFailureOf(call) };
    return parseOk(feedbackPageDto, call.body, (body) => body);
  }

  async publish(
    entryId: string,
    request: PublishFeedbackRequestDto,
  ): Promise<FeedbackAdminResult<PublishFeedbackResponseDto>> {
    const body = publishFeedbackRequestDto.parse(request);
    const call = await callApi(this.transport, 'POST', `${entryPathOf(entryId)}/publish`, body);
    if (call.kind !== 'ok') return { ok: false, failure: feedbackAdminFailureOf(call) };
    return parseOk(publishFeedbackResponseDto, call.body, (parsed) => parsed);
  }

  async archive(entryId: string): Promise<FeedbackAdminResult<null>> {
    const call = await callApi(this.transport, 'POST', `${entryPathOf(entryId)}/archive`);
    if (call.kind !== 'ok') return { ok: false, failure: feedbackAdminFailureOf(call) };
    return { ok: true, value: null };
  }
}

function entryPathOf(entryId: string): string {
  return `/admin/feedback/${encodeURIComponent(entryId)}`;
}

function feedbackAdminFailureOf(call: Exclude<ApiCall, { kind: 'ok' }>): FeedbackAdminFailure {
  if (call.kind === 'offline') return userAdminFailureOf(call);
  const body = apiErrorDto.safeParse(call.response.body);
  const tracker = body.success ? TRACKER_FAILURE_BY_CODE[body.data.code] : undefined;
  return tracker ?? userAdminFailureOf(call);
}
