import { describe, expect, it } from 'vitest';
import {
  clientErrorEnvelopeOf,
  envelopeTextOf,
} from '../../../src/modules/error-reports/client-error-envelope.mapper';
import { ErrorReportError } from '../../../src/modules/error-reports/error-reports.error';

const DSN = 'https://abc@o1.ingest.de.sentry.io/123';
const EVENT = JSON.stringify({ event_id: 'e1', message: 'ação inválida' });

function envelope(...lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

function refusalOf(text: string): ErrorReportError {
  try {
    clientErrorEnvelopeOf(text);
  } catch (error) {
    if (error instanceof ErrorReportError) return error;
    throw error;
  }
  throw new Error(`expected an INVALID_ENVELOPE for ${JSON.stringify(text)}`);
}

describe('clientErrorEnvelopeOf', () => {
  it('reads the header line and one event item', () => {
    const text = envelope(JSON.stringify({ dsn: DSN }), JSON.stringify({ type: 'event' }), EVENT);
    expect(clientErrorEnvelopeOf(text)).toEqual({
      header: { dsn: DSN },
      items: [{ header: { type: 'event' }, payload: EVENT, event: JSON.parse(EVENT) as object }],
    });
  });

  it('counts a sized payload in UTF-8 bytes, accents included', () => {
    const sized = JSON.stringify({ type: 'event', length: Buffer.byteLength(EVENT) });
    const session = JSON.stringify({ type: 'session' });
    const text = envelope(JSON.stringify({ dsn: DSN }), sized, EVENT, session, '{"sid":"s"}');
    const items = clientErrorEnvelopeOf(text).items;
    expect(items.map((item) => item.payload)).toEqual([EVENT, '{"sid":"s"}']);
  });

  it('round-trips to the same text', () => {
    const sized = JSON.stringify({ type: 'event', length: Buffer.byteLength(EVENT) });
    const text = envelope(JSON.stringify({ dsn: DSN }), sized, EVENT);
    expect(envelopeTextOf(clientErrorEnvelopeOf(text))).toBe(text);
  });

  it('a header that is not JSON is refused citing the line and the value', () => {
    const refusal = refusalOf(envelope('nao-e-json', JSON.stringify({ type: 'event' }), EVENT));
    expect(refusal.code).toBe('INVALID_ENVELOPE');
    expect(refusal.message).toBe(
      'line 1: the envelope header must be a JSON object with its fields (received "nao-e-json")',
    );
  });

  it('an item without type is refused', () => {
    const refusal = refusalOf(envelope(JSON.stringify({ dsn: DSN }), '{"length":2}', '{}'));
    expect(refusal.message).toContain('line 2: an item header must be a JSON object');
  });

  it('a length past the end of the body is refused citing both sizes', () => {
    const text = envelope(JSON.stringify({ dsn: DSN }), '{"type":"event","length":500}', EVENT);
    expect(refusalOf(text).message).toContain('the item says 500 bytes');
  });
});

describe('clientErrorEnvelopeOf, the event payload', () => {
  it('an event that is not a JSON object refuses the envelope', () => {
    const text = envelope(JSON.stringify({ dsn: DSN }), JSON.stringify({ type: 'event' }), '42');
    expect(refusalOf(text).message).toBe('an event must be a JSON object (received "42")');
  });
});
