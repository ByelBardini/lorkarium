import type { ErrorEvent, NodeOptions } from '@sentry/node';

type TransportFactory = NonNullable<NodeOptions['transport']>;
type Transport = ReturnType<TransportFactory>;
type SentEnvelope = Parameters<Transport['send']>[0];

/** Answers every envelope with 200 and keeps the events it carried, in order. */
export class SentryTransportFake {
  readonly envelopes: SentEnvelope[] = [];

  /** The `transport` option of `init`. */
  readonly factory: TransportFactory = () => ({
    send: (envelope) => {
      this.envelopes.push(envelope);
      return Promise.resolve({ statusCode: 200 });
    },
    flush: () => Promise.resolve(true),
  });

  get events(): ErrorEvent[] {
    return this.envelopes.flatMap(([, items]) =>
      items.flatMap(([header, payload]) =>
        header.type === 'event' ? [payload as ErrorEvent] : [],
      ),
    );
  }
}
