import { describe, expect, it } from 'vitest';
import {
  USER_REPORT_ADMIN_NOTE_MAX_LENGTH,
  USER_REPORT_ATTACHMENTS_MAX,
  USER_REPORT_DETAILS_MAX_LENGTH,
  USER_REPORT_REASONS,
  listUserReportsQueryDto,
  resolveUserReportRequestDto,
  userReportDto,
  userReportRequestDto,
  type UserReportDto,
} from '../../src/profiles/user-report.dto';

const TABLE_ID = '00000000-0000-4000-8000-0000000000aa';

function fiveIds(): string[] {
  return [1, 2, 3, 4, 5].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
}

function userReportDtoSample(overrides: Partial<Record<keyof UserReportDto, unknown>>): object {
  return {
    id: '00000000-0000-4000-8000-0000000000bb',
    reason: 'harassment',
    details: null,
    status: 'resolved',
    reporter: { id: '00000000-0000-4000-8000-0000000000cc', username: 'bia' },
    target: { id: '00000000-0000-4000-8000-0000000000dd', username: 'caio', name: 'Caio' },
    campaignId: TABLE_ID,
    campaignName: 'Os Sinos de Vharn',
    attachments: [
      { id: TABLE_ID, mimeType: 'image/webp', width: 800, height: 600, sizeBytes: 900 },
    ],
    adminNote: 'warned',
    createdAt: '2026-11-19T12:00:00.000Z',
    resolvedAt: '2026-11-20T12:00:00.000Z',
    resolvedBy: 'root',
    ...overrides,
  };
}

function pathsOf(input: unknown): string[] {
  const result = userReportRequestDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) =>
    [...issue.path, ...('keys' in issue ? issue.keys : [])].join('.'),
  );
}

describe('userReportRequestDto', () => {
  it.each(USER_REPORT_REASONS)('the reason %s without details is accepted', (reason) => {
    expect(userReportRequestDto.parse({ reason })).toEqual({ reason });
  });

  it('details are trimmed and kept', () => {
    expect(userReportRequestDto.parse({ reason: 'spam', details: '  links  ' })).toEqual({
      reason: 'spam',
      details: 'links',
    });
  });

  it('details of only spaces become null', () => {
    expect(userReportRequestDto.parse({ reason: 'other', details: '   ' })).toEqual({
      reason: 'other',
      details: null,
    });
  });

  it('details of 1000 characters are accepted and 1001 are refused', () => {
    expect(USER_REPORT_DETAILS_MAX_LENGTH).toBe(1000);
    expect(pathsOf({ reason: 'other', details: 'a'.repeat(1000) })).toEqual([]);
    expect(pathsOf({ reason: 'other', details: 'a'.repeat(1001) })).toEqual(['details']);
  });

  it('an unknown reason is refused naming the value and the expected list', () => {
    const message = userReportRequestDto.safeParse({ reason: 'boring' }).error?.issues[0]?.message;
    expect(message).toContain('"boring"');
    expect(message).toContain('harassment');
  });

  it('an extra field is refused (strict)', () => {
    expect(pathsOf({ reason: 'spam', reporterId: 'x' })).toEqual(['reporterId']);
  });

  it('a table and up to 5 attachments are accepted as given', () => {
    const body = { reason: 'harassment', campaignId: TABLE_ID, attachmentIds: fiveIds() };

    expect(userReportRequestDto.parse(body)).toEqual(body);
  });

  it('a 6th attachment is refused naming the maximum', () => {
    const ids = [...fiveIds(), '00000000-0000-4000-8000-000000000006'];
    const result = userReportRequestDto.safeParse({ reason: 'spam', attachmentIds: ids });

    expect(USER_REPORT_ATTACHMENTS_MAX).toBe(5);
    expect(result.error?.issues[0]?.path).toEqual(['attachmentIds']);
    expect(result.error?.issues[0]?.message).toContain('at most 5');
  });

  it('the same attachment twice is refused naming the repeated id', () => {
    const [first] = fiveIds();
    const result = userReportRequestDto.safeParse({
      reason: 'spam',
      attachmentIds: [first, first],
    });

    expect(result.error?.issues[0]?.path).toEqual(['attachmentIds']);
    expect(result.error?.issues[0]?.message).toContain(first);
  });

  it('a table that is not a uuid is refused', () => {
    expect(pathsOf({ reason: 'spam', campaignId: 'vharn' })).toEqual(['campaignId']);
  });
});

describe('userReportDto (the backoffice item)', () => {
  it('a report whose accounts and table are gone keeps the @, the name and the table name', () => {
    const item = userReportDtoSample({
      reporter: { id: null, username: 'bia' },
      target: { id: null, username: 'caio', name: 'Caio' },
      campaignId: null,
      campaignName: 'Os Sinos de Vharn',
    });

    expect(userReportDto.parse(item)).toEqual(item);
  });

  it('an attachment without its pixels is refused', () => {
    const item = userReportDtoSample({ attachments: [{ id: TABLE_ID, mimeType: 'image/webp' }] });

    expect(userReportDto.safeParse(item).success).toBe(false);
  });
});

describe('resolveUserReportRequestDto with a note', () => {
  it('the note is trimmed and kept', () => {
    expect(resolveUserReportRequestDto.parse({ status: 'resolved', note: ' warned ' })).toEqual({
      status: 'resolved',
      note: 'warned',
    });
  });

  it('a note of only spaces becomes null and one past 2000 is refused', () => {
    expect(resolveUserReportRequestDto.parse({ status: 'dismissed', note: '  ' }).note).toBeNull();
    const long = resolveUserReportRequestDto.safeParse({
      status: 'resolved',
      note: 'a'.repeat(2001),
    });
    expect(USER_REPORT_ADMIN_NOTE_MAX_LENGTH).toBe(2000);
    expect(long.error?.issues[0]?.path).toEqual(['note']);
  });
});

describe('resolveUserReportRequestDto', () => {
  it.each(['resolved', 'dismissed'])('the status %s is accepted', (status) => {
    expect(resolveUserReportRequestDto.parse({ status })).toEqual({ status });
  });

  it('going back to open is refused', () => {
    expect(resolveUserReportRequestDto.safeParse({ status: 'open' }).success).toBe(false);
  });
});

describe('listUserReportsQueryDto', () => {
  it('without a query it lists the first page of the open reports', () => {
    expect(listUserReportsQueryDto.parse({})).toEqual({ status: 'open', page: 1 });
  });

  it('the page from the query string becomes a number', () => {
    expect(listUserReportsQueryDto.parse({ status: 'resolved', page: '3' })).toEqual({
      status: 'resolved',
      page: 3,
    });
  });

  it.each(['0', '-1', '1.5', 'x'])('page %s is refused', (page) => {
    expect(listUserReportsQueryDto.safeParse({ page }).success).toBe(false);
  });
});
