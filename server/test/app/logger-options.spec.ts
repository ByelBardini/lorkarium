import { Writable } from 'node:stream';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { loggerOptions, requestLogLineOf } from '../../src/app/logger-options';

/** Collects every line pino writes, parsed. */
class LogLinesSink extends Writable {
  readonly lines: Record<string, unknown>[] = [];

  override _write(chunk: Buffer, _encoding: string, done: () => void): void {
    this.lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
    done();
  }
}

describe('requestLogLineOf', () => {
  it('keeps the method and the declared route, without the ids nor the query', () => {
    const request = {
      method: 'GET',
      url: '/api/campaigns/7f1c?token=abc',
      routeOptions: { url: '/api/campaigns/:campaignId' },
    };
    expect(requestLogLineOf(request as never)).toEqual({
      method: 'GET',
      route: '/api/campaigns/:campaignId',
    });
  });

  it('an unmatched request keeps the bare path, without the query', () => {
    const request = { method: 'POST', url: '/api/nada?email=ana@mesa.com', routeOptions: {} };
    expect(requestLogLineOf(request as never)).toEqual({ method: 'POST', route: '/api/nada' });
  });
});

describe('loggerOptions', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('is silent in tests', () => {
    expect(loggerOptions({ nodeEnv: 'test' })).toMatchObject({ level: 'silent' });
  });

  it('logs a request without the IP, the port, the host nor the query string', async () => {
    const sink = new LogLinesSink();
    const options = loggerOptions({ nodeEnv: 'production' });
    if (typeof options !== 'object' || options === null)
      throw new Error(`expected logger options, got ${String(options)}`);
    app = Fastify({ logger: { ...options, stream: sink } });
    app.get('/api/campaigns/:campaignId', async () => ({ ok: true }));
    await app.inject({
      method: 'GET',
      url: '/api/campaigns/7f1c?token=segredo',
      remoteAddress: '203.0.113.9',
      headers: { cookie: 'lk_session=abc' },
    });
    const text = JSON.stringify(sink.lines);
    expect(sink.lines.some((line) => line.msg === 'incoming request')).toBe(true);
    expect(text).toContain('/api/campaigns/:campaignId');
    for (const leak of ['203.0.113.9', 'remoteAddress', 'remotePort', 'segredo', 'lk_session']) {
      expect(text).not.toContain(leak);
    }
  });
});
