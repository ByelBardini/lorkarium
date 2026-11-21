import { describe, expect, it } from 'vitest';
import {
  ClientErrorEnvelopeBo,
  type ClientErrorEnvelope,
} from '../../../src/modules/error-reports/client-error-envelope.bo';

const DSN = 'https://abc@o1.ingest.de.sentry.io/123';
const BIA = { id: 'b1a5e6f0-0000-4000-8000-000000000001', username: 'bia' };

function envelopeWith(
  items: { type: string; payload: object }[],
  dsn: string | null = DSN,
): ClientErrorEnvelope {
  return {
    header: dsn === null ? {} : { dsn },
    items: items.map(({ type, payload }) => ({
      header: { type },
      payload: JSON.stringify(payload),
      event: type === 'event' ? { ...payload } : null,
    })),
  };
}

function forwardedEvent(event: object, sender: typeof BIA | null = BIA): Record<string, unknown> {
  const bo = new ClientErrorEnvelopeBo(DSN);
  const forwarded = bo.forwardable(envelopeWith([{ type: 'event', payload: event }]), sender);
  return JSON.parse(forwarded?.items[0]?.payload ?? 'null') as Record<string, unknown>;
}

describe('ClientErrorEnvelopeBo.forwardable', () => {
  it('our DSN is accepted', () => {
    const bo = new ClientErrorEnvelopeBo(DSN);
    const forwarded = bo.forwardable(envelopeWith([{ type: 'event', payload: {} }]), null);
    expect(forwarded).toEqual({
      header: { dsn: DSN },
      items: [{ header: { type: 'event' }, payload: '{}', event: {} }],
    });
  });

  it.each([
    ['another DSN', 'https://x@o9.ingest.sentry.io/9', '"https://x@o9.ingest.sentry.io/9"'],
    ['no DSN', null, 'nothing'],
  ])('%s is UNKNOWN_DSN citing what came', (_case, dsn, received) => {
    const bo = new ClientErrorEnvelopeBo(DSN);
    expect(() => bo.forwardable(envelopeWith([{ type: 'event', payload: {} }], dsn), null)).toThrow(
      `the envelope DSN is not ours (received ${received})`,
    );
  });

  it('keeps only the event items', () => {
    const bo = new ClientErrorEnvelopeBo(DSN);
    const others = ['session', 'client_report', 'attachment', 'replay_event', 'transaction'];
    const items = [...others, 'event'].map((type) => ({ type, payload: {} }));
    const forwarded = bo.forwardable(envelopeWith(items), null);
    expect(forwarded?.items.map((item) => item.header.type)).toEqual(['event']);
  });

  it('an envelope without an event has nothing to forward', () => {
    const bo = new ClientErrorEnvelopeBo(DSN);
    expect(bo.forwardable(envelopeWith([{ type: 'session', payload: {} }]), BIA)).toBeNull();
  });

  it('a forged user is replaced by the account of the session', () => {
    const event = forwardedEvent({ user: { id: 'forjado', ip_address: '203.0.113.9' } });
    expect(event.user).toEqual({ id: BIA.id, username: 'bia' });
  });

  it('without a session the event goes without user', () => {
    expect(forwardedEvent({ user: { id: 'forjado' } }, null)).not.toHaveProperty('user');
  });

  it('URLs lose their query and fragment, and the request its cookies and headers but the User-Agent', () => {
    const event = forwardedEvent({
      request: {
        url: 'https://mesa.example.com/reset-password?token=abc#x',
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://mesa.example.com/?token=abc' },
        cookies: { lk_session: 's' },
      },
      breadcrumbs: {
        values: [
          { category: 'fetch', data: { url: '/api/x?email=bia@x.com' } },
          { category: 'navigation', data: { from: '/a?t=1', to: '/b#frag' } },
        ],
      },
    });
    expect(event.request).toEqual({
      url: 'https://mesa.example.com/reset-password',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    expect(event.breadcrumbs).toEqual({
      values: [
        { category: 'fetch', data: { url: '/api/x' } },
        { category: 'navigation', data: { from: '/a', to: '/b' } },
      ],
    });
  });
});
