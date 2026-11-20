import type {
  FeedbackEntryDto,
  FeedbackPageDto,
  FeedbackRequestDto,
  ListFeedbackQueryDto,
  PublishFeedbackRequestDto,
  PublishFeedbackResponseDto,
  ScreenshotDto,
} from '@lorkarium/contracts';
import type { AccountResult } from '@/services/account-failure';
import type {
  FeedbackAdminApi,
  FeedbackAdminFailure,
  FeedbackAdminResult,
} from '@/services/feedback-admin-api';
import type {
  FeedbackApi,
  FeedbackAttachmentFailure,
  FeedbackFailure,
} from '@/services/feedback-api';
import { FEEDBACK_SHOT } from './feedback-fixtures';

/** The sender's side in memory: keeps what was sent and the files that went up; `failNext`
 *  answers the next send with a failure, `refuseUploadOf` refuses a file by its name. */
export class FeedbackApiFake implements FeedbackApi {
  readonly sent: FeedbackRequestDto[] = [];
  readonly uploads: string[] = [];
  failNext: FeedbackFailure | null = null;
  refuseUploadOf: Readonly<{ name: string; failure: FeedbackAttachmentFailure }> | null = null;

  async send(request: FeedbackRequestDto): Promise<AccountResult<null, FeedbackFailure>> {
    const failure = this.failNext;
    this.failNext = null;
    if (failure) return { ok: false, failure };
    this.sent.push(request);
    return { ok: true, value: null };
  }

  async uploadAttachment(
    file: Blob,
  ): Promise<AccountResult<ScreenshotDto, FeedbackAttachmentFailure>> {
    const name = file instanceof File ? file.name : 'blob';
    if (this.refuseUploadOf?.name === name)
      return { ok: false, failure: this.refuseUploadOf.failure };
    const id = `00000000-0000-4000-8000-${String(this.uploads.length + 1).padStart(12, '0')}`;
    this.uploads.push(id);
    return { ok: true, value: { ...FEEDBACK_SHOT, id } };
  }
}

/** The backoffice queue in memory: publishing or archiving takes the entry out, as the server
 *  does; `answers` scripts the next failure of each command. */
export class FeedbackAdminApiFake implements FeedbackAdminApi {
  entries: FeedbackEntryDto[];
  readonly published: Readonly<{ entryId: string; request: PublishFeedbackRequestDto }>[] = [];
  readonly archived: string[] = [];
  readonly answers: Partial<Record<'list' | 'publish' | 'archive', FeedbackAdminFailure>> = {};
  private nextIssue = 42;

  constructor(entries: readonly FeedbackEntryDto[] = []) {
    this.entries = [...entries];
  }

  async list(query: ListFeedbackQueryDto): Promise<FeedbackAdminResult<FeedbackPageDto>> {
    const failure = this.takeAnswer('list');
    if (failure) return { ok: false, failure };
    const page = {
      entries: this.entries,
      page: query.page,
      pageSize: 50,
      total: this.entries.length,
    };
    return { ok: true, value: page };
  }

  async publish(
    entryId: string,
    request: PublishFeedbackRequestDto,
  ): Promise<FeedbackAdminResult<PublishFeedbackResponseDto>> {
    const failure = this.takeAnswer('publish');
    if (failure) return { ok: false, failure };
    this.published.push({ entryId, request });
    this.entries = this.entries.filter((entry) => entry.id !== entryId);
    const issueNumber = this.nextIssue++;
    const issueUrl = `https://github.com/ByelBardini/lorkarium/issues/${issueNumber}`;
    return { ok: true, value: { issueUrl, issueNumber } };
  }

  async archive(entryId: string): Promise<FeedbackAdminResult<null>> {
    const failure = this.takeAnswer('archive');
    if (failure) return { ok: false, failure };
    this.archived.push(entryId);
    this.entries = this.entries.filter((entry) => entry.id !== entryId);
    return { ok: true, value: null };
  }

  private takeAnswer(command: 'list' | 'publish' | 'archive'): FeedbackAdminFailure | undefined {
    const failure = this.answers[command];
    delete this.answers[command];
    return failure;
  }
}
