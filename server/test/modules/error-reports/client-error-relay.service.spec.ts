import { describe, expect, it } from 'vitest';
import { ClientErrorEnvelopeBo } from '../../../src/modules/error-reports/client-error-envelope.bo';
import { ClientErrorRelayService } from '../../../src/modules/error-reports/client-error-relay.service';
import { ClientErrorRelayFake, ReportFailureLogFake } from '../../support/error-reports-fakes';

const DSN = 'https://abc@o1.ingest.de.sentry.io/123';
const BIA = { id: 'b1a5e6f0-0000-4000-8000-000000000001', username: 'bia' };

function envelopeText(dsn: string, ...items: [string, object][]): string {
  const lines = [JSON.stringify({ dsn })];
  for (const [type, payload] of items)
    lines.push(JSON.stringify({ type }), JSON.stringify(payload));
  return `${lines.join('\n')}\n`;
}

function serviceWith(relay: ClientErrorRelayFake) {
  const log = new ReportFailureLogFake();
  const envelope = new ClientErrorEnvelopeBo(DSN);
  return { service: new ClientErrorRelayService({ relay, envelope, log }), log };
}

describe('ClientErrorRelayService.relay', () => {
  it('forwards one envelope, already filtered and stamped', async () => {
    const relay = new ClientErrorRelayFake();
    const { service } = serviceWith(relay);
    const text = envelopeText(DSN, ['session', {}], ['event', { user: { id: 'forjado' } }]);
    expect(await service.relay(text, BIA)).toBe('forwarded');
    expect(relay.forwarded).toHaveLength(1);
    const lines = relay.forwarded[0]?.trim().split('\n') ?? [];
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[2] ?? 'null')).toEqual({ user: BIA });
  });

  it('only a client report forwards nothing', async () => {
    const relay = new ClientErrorRelayFake();
    const { service } = serviceWith(relay);
    expect(await service.relay(envelopeText(DSN, ['client_report', {}]), null)).toBe(
      'nothing-to-forward',
    );
    expect(relay.forwarded).toEqual([]);
  });

  it('another DSN is refused and nothing is forwarded', async () => {
    const relay = new ClientErrorRelayFake();
    const { service } = serviceWith(relay);
    const text = envelopeText('https://x@o9.ingest.sentry.io/9', ['event', {}]);
    await expect(service.relay(text, null)).rejects.toMatchObject({ code: 'UNKNOWN_DSN' });
    expect(relay.forwarded).toEqual([]);
  });

  it('a relay that fails is one warn, never an error', async () => {
    const relay = new ClientErrorRelayFake().failing();
    const { service, log } = serviceWith(relay);
    expect(await service.relay(envelopeText(DSN, ['event', {}]), null)).toBe('relay-failed');
    expect(log.warnings.map((warning) => warning.message)).toEqual([
      'browser error report not forwarded to Sentry',
    ]);
  });
});
