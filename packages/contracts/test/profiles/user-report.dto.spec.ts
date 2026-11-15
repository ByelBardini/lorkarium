import { describe, expect, it } from 'vitest';
import {
  USER_REPORT_DETAILS_MAX_LENGTH,
  USER_REPORT_REASONS,
  listUserReportsQueryDto,
  resolveUserReportRequestDto,
  userReportRequestDto,
} from '../../src/profiles/user-report.dto';

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
