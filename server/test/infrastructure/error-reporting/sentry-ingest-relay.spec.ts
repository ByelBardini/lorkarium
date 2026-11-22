import { describe, expect, it } from 'vitest';
import {
  ingestUrlOf,
  SentryIngestRelay,
} from '../../../src/infrastructure/error-reporting/sentry-ingest-relay';
import { IngestFetchFake } from '../../support/error-reports-fakes';

const DSN = 'https://abc@o1.ingest.de.sentry.io/123';
const ENVELOPE = '{"dsn":"x"}\n{"type":"event"}\n{"message":"ação"}\n';

describe('SentryIngestRelay.forward', () => {
  it('posts the envelope untouched to the ingest of the DSN host, without X-Forwarded-For', async () => {
    const ingest = new IngestFetchFake();
    await new SentryIngestRelay({ dsn: DSN, fetch: ingest.fetch }).forward(ENVELOPE);
    expect(ingest.calls).toHaveLength(1);
    const [call] = ingest.calls;
    expect(call?.url).toBe('https://o1.ingest.de.sentry.io/api/123/envelope/');
    expect(call?.init).toMatchObject({
      method: 'POST',
      body: ENVELOPE,
      headers: { 'content-type': 'application/x-sentry-envelope' },
    });
    expect(JSON.stringify(call?.init.headers).toLowerCase()).not.toContain('forwarded');
  });

  it.each([429, 500])('an answer %i rejects citing the status', async (status) => {
    const ingest = new IngestFetchFake();
    ingest.status = status;
    const relay = new SentryIngestRelay({ dsn: DSN, fetch: ingest.fetch });
    await expect(relay.forward(ENVELOPE)).rejects.toThrow(`Sentry ingest answered ${status}`);
  });

  it('no answer within the time rejects citing it', async () => {
    const ingest = new IngestFetchFake();
    ingest.hangs = true;
    const relay = new SentryIngestRelay({ dsn: DSN, fetch: ingest.fetch, timeoutMs: 20 });
    await expect(relay.forward(ENVELOPE)).rejects.toThrow(
      'Sentry ingest did not answer within 20 ms',
    );
  });
});

describe('ingestUrlOf', () => {
  it('keeps a path prefix of a self-hosted DSN', () => {
    expect(ingestUrlOf('http://chave@localhost:9000/sentry/1')).toBe(
      'http://localhost:9000/sentry/api/1/envelope/',
    );
  });
});
