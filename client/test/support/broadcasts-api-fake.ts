import type {
  MailBroadcastContentInput,
  MailBroadcastDraftResponseDto,
  MailBroadcastDto,
  MailBroadcastPreviewDto,
  MailBroadcastSegmentDto,
  MailBroadcastTestResponseDto,
} from '@lorkarium/contracts';
import type { BroadcastsApi, BroadcastsFailure, BroadcastsResult } from '@/services/broadcasts-api';

const CREATED_AT = '2026-11-19T12:00:00.000Z';

/** A notice as the server lists it: a draft unless the overrides say otherwise. */
export function mailBroadcast(overrides: Partial<MailBroadcastDto> = {}): MailBroadcastDto {
  return {
    id: '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f',
    segment: 'all',
    subject: 'Os preços mudam em 30 dias',
    title: 'Novos preços',
    paragraphs: ['A partir de janeiro o Narrador custa R$ 19,90.'],
    button: null,
    createdAt: CREATED_AT,
    testedAt: null,
    confirmedAt: null,
    finishedAt: null,
    total: null,
    sent: 0,
    failed: 0,
    skipped: 0,
    ...overrides,
  };
}

type Call = Readonly<{ method: keyof BroadcastsApi; args: readonly unknown[] }>;

/** The backoffice notices in memory: an audience per segment (`all`, `paid`, a plan), one draft
 *  id, every call recorded; `failures` answers the next call of a method with a refusal. */
export class BroadcastsApiFake implements BroadcastsApi {
  readonly calls: Call[] = [];
  readonly failures: Partial<Record<keyof BroadcastsApi, BroadcastsFailure>> = {};
  broadcasts: MailBroadcastDto[] = [];
  audiences: Readonly<Record<string, number>> = {
    all: 1300,
    paid: 120,
    apoiador: 10,
    narrador: 70,
    lenda: 40,
  };
  adminEmail = 'fernanda@mesa.com';
  private draft: MailBroadcastDto | null = null;

  async list(): Promise<BroadcastsResult<MailBroadcastDto[]>> {
    return this.answer('list', [], () => this.broadcasts);
  }

  async audience(segment: MailBroadcastSegmentDto): Promise<BroadcastsResult<number>> {
    return this.answer('audience', [segment], () => this.countOf(segment));
  }

  async preview(
    content: MailBroadcastContentInput,
  ): Promise<BroadcastsResult<MailBroadcastPreviewDto>> {
    return this.answer('preview', [content], () => ({
      subject: content.subject,
      html: `<html><body><h1>${content.title}</h1></body></html>`,
      audience: this.countOf(content.segment),
    }));
  }

  async create(
    content: MailBroadcastContentInput,
  ): Promise<BroadcastsResult<MailBroadcastDraftResponseDto>> {
    return this.answer('create', [content], () => this.drafted(content));
  }

  async rewrite(
    broadcastId: string,
    content: MailBroadcastContentInput,
  ): Promise<BroadcastsResult<MailBroadcastDraftResponseDto>> {
    return this.answer('rewrite', [broadcastId, content], () => this.drafted(content));
  }

  async sendTest(broadcastId: string): Promise<BroadcastsResult<MailBroadcastTestResponseDto>> {
    return this.answer('sendTest', [broadcastId], () => {
      this.draft = mailBroadcast({ ...this.draft, testedAt: CREATED_AT });
      return { broadcast: this.draft, to: this.adminEmail };
    });
  }

  async confirm(broadcastId: string, total: number): Promise<BroadcastsResult<MailBroadcastDto>> {
    return this.answer('confirm', [broadcastId, total], () => {
      const confirmed = mailBroadcast({ ...this.draft, confirmedAt: CREATED_AT, total });
      this.broadcasts = [confirmed, ...this.broadcasts];
      return confirmed;
    });
  }

  /** The methods called, in order. */
  methods(): string[] {
    return this.calls.map(({ method }) => method);
  }

  private drafted(content: MailBroadcastContentInput): MailBroadcastDraftResponseDto {
    const { segment, subject, title, paragraphs } = content;
    this.draft = mailBroadcast({
      segment,
      subject,
      title,
      paragraphs,
      button: content.button ?? null,
    });
    return { broadcast: this.draft, audience: this.countOf(segment) };
  }

  private countOf(segment: MailBroadcastSegmentDto): number {
    const key = typeof segment === 'string' ? segment : segment.plan;
    return this.audiences[key] ?? 0;
  }

  private answer<T>(
    method: keyof BroadcastsApi,
    args: readonly unknown[],
    value: () => T,
  ): BroadcastsResult<T> {
    this.calls.push({ method, args });
    const failure = this.failures[method];
    if (!failure) return { ok: true, value: value() };
    delete this.failures[method];
    return { ok: false, failure };
  }
}
