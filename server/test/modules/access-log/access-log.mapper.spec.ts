import { describe, expect, it } from 'vitest';
import type { AccessRecord } from '../../../src/modules/access-log/access-log.bo';
import { jsonLinesOf } from '../../../src/modules/access-log/access-log.mapper';

const LOGIN: AccessRecord = {
  kind: 'http',
  at: '2026-10-25T03:04:05.678Z',
  ip: '203.0.113.7',
  userId: null,
  method: 'POST',
  route: '/api/auth/login',
  status: 401,
};
const CONNECT: AccessRecord = {
  kind: 'realtime-connect',
  at: '2026-10-25T03:04:06.000Z',
  ip: '203.0.113.7',
  userId: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01',
};

describe('jsonLinesOf', () => {
  it('writes one JSON object per line, each line ending in a newline', () => {
    const lines = jsonLinesOf([LOGIN, CONNECT]);

    expect(lines.endsWith('\n')).toBe(true);
    expect(
      lines
        .split('\n')
        .slice(0, -1)
        .map((line) => JSON.parse(line)),
    ).toStrictEqual([LOGIN, CONNECT]);
  });

  it('an empty batch is an empty text (the boot marker)', () => {
    expect(jsonLinesOf([])).toBe('');
  });
});
