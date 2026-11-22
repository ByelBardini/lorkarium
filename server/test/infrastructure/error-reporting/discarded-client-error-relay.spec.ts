import { describe, expect, it } from 'vitest';
import { DiscardedClientErrorRelay } from '../../../src/infrastructure/error-reporting/discarded-client-error-relay';
import type { ClientErrorRelay } from '../../../src/modules/error-reports/client-error-relay.port';

describe('DiscardedClientErrorRelay', () => {
  it('resolves without sending the envelope anywhere', async () => {
    const relay: ClientErrorRelay = new DiscardedClientErrorRelay();
    await expect(relay.forward('{}\n')).resolves.toBeUndefined();
  });
});
