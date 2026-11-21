import type { BrowserOptions, ErrorEvent } from '@sentry/browser';

type TransportFactory = NonNullable<BrowserOptions['transport']>;
type Transport = ReturnType<TransportFactory>;
type SentEnvelope = Parameters<Transport['send']>[0];

/** Answers every envelope with 200, keeping the events it carried and the URL it was built for. */
export class SentryBrowserTransportFake {
  readonly envelopes: SentEnvelope[] = [];
  urls: string[] = [];

  /** The `transport` option of `init`. */
  readonly factory: TransportFactory = (options) => {
    this.urls.push(options.url);
    return {
      send: (envelope) => {
        this.envelopes.push(envelope);
        return Promise.resolve({ statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    };
  };

  get events(): ErrorEvent[] {
    return this.envelopes.flatMap(([, items]) =>
      items.flatMap(([header, payload]) =>
        header.type === 'event' ? [payload as ErrorEvent] : [],
      ),
    );
  }
}
