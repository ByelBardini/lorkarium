import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';
import {
  errorFingerprintOf,
  unexpectedErrorOf,
} from '../../../src/modules/error-reports/unexpected-error.mapper';

const REQUEST = { reqId: 'req-1', route: '/api/campaigns/:campaignId', method: 'PATCH' };

function errorAt(message: string, frame: string): Error {
  const error = new Error(message);
  error.stack = `Error: ${message}\n    at ${frame}\n    at next (node:internal)`;
  return error;
}

describe('unexpectedErrorOf', () => {
  it('a module handler log keeps the error, the message and the request', () => {
    const err = new Error('boom');
    expect(
      unexpectedErrorOf([{ err }, 'unexpected error in the campaigns module'], REQUEST),
    ).toEqual({
      error: err,
      message: 'unexpected error in the campaigns module',
      fields: {},
      context: REQUEST,
      user: null,
    });
  });

  it('a bare error takes its own message', () => {
    const err = new Error('pool ended');
    const report = unexpectedErrorOf([err], {});
    expect(report.error).toBe(err);
    expect(report.message).toBe('pool ended');
  });

  it('a log without an error keeps its fields', () => {
    const report = unexpectedErrorOf([{ lost: 3 }, 'access log lines lost on close'], {});
    expect(report).toMatchObject({ error: null, fields: { lost: 3 } });
  });

  it('the bindings of a signed-in request name the account', () => {
    const report = unexpectedErrorOf([{ err: new Error('x') }, 'y'], {
      userId: 'u-1',
      username: 'bia',
    });
    expect(report.user).toEqual({ id: 'u-1', username: 'bia' });
  });

  it('a userId field (the socket log) names the account without the @', () => {
    const report = unexpectedErrorOf([{ err: new Error('x'), userId: 'u-2', event: 'e' }, 'y'], {});
    expect(report.user).toEqual({ id: 'u-2', username: null });
    expect(report.fields).toEqual({ event: 'e' });
  });

  it('a Drizzle query error loses its params, but keeps the query and the pg cause', () => {
    const cause = new Error('duplicate key value violates unique constraint');
    const failed = new DrizzleQueryError('select "id" from "accounts"', ['bia@x.com', 42], cause);
    const report = unexpectedErrorOf([{ err: failed, params: ['bia@x.com'] }, 'z'], {});
    expect(report.error?.message).toBe('Failed query: select "id" from "accounts"');
    expect(report.error?.stack).not.toContain('bia@x.com');
    expect(report.error).not.toHaveProperty('params');
    expect(report.error?.cause).toBe(cause);
    expect(report.fields).toEqual({});
  });

  it('a Drizzle query error under a cause is cleaned too', () => {
    const failed = new DrizzleQueryError('update "x"', ['segredo'], undefined);
    const outer = new Error('save failed', { cause: failed });
    const report = unexpectedErrorOf([{ err: outer }, 'z'], {});
    expect((report.error?.cause as Error).message).toBe('Failed query: update "x"');
    expect(report.error?.message).toBe('save failed');
  });
});

describe('errorFingerprintOf', () => {
  const fingerprintOf = (error: Error, message = 'unexpected') =>
    errorFingerprintOf(unexpectedErrorOf([{ err: error }, message], {}));

  it('messages that differ only by uuid or number share the fingerprint', () => {
    const frame = 'CampaignsService.update (src/campaigns.service.ts:10:3)';
    const first = errorAt('campaign 2b1f0c4e-8a1d-4c55-9a3e-1f2b3c4d5e6f has 3 tokens', frame);
    const second = errorAt('campaign 9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d has 17 tokens', frame);
    expect(fingerprintOf(first)).toBe(fingerprintOf(second));
  });

  it('a different first frame is a different fingerprint', () => {
    const first = errorAt('boom', 'a (src/a.ts:1:1)');
    const second = errorAt('boom', 'b (src/b.ts:1:1)');
    expect(fingerprintOf(first)).not.toBe(fingerprintOf(second));
  });

  it('a different log message is a different fingerprint', () => {
    const error = errorAt('boom', 'a (src/a.ts:1:1)');
    expect(fingerprintOf(error, 'one')).not.toBe(fingerprintOf(error, 'other'));
  });
});
