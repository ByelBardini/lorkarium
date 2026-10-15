import { describe, expect, it } from 'vitest';
import { ApiLoadError, valueOrThrow } from '@/app/shell/api-loader';
import { createSessionStore } from '@/stores/session-store';
import { ANA } from '../../support/auth-api-fake';

function signedInStore() {
  const store = createSessionStore();
  store.getState().signedIn(ANA);
  return store;
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (thrown) {
    return thrown;
  }
  throw new Error('expected the call to throw');
}

const REQUEST = new Request('http://localhost/campaigns/abc?tab=x');

describe('valueOrThrow', () => {
  it('an ok result gives its value', () => {
    expect(valueOrThrow({ ok: true, value: 42 }, REQUEST, signedInStore())).toBe(42);
  });

  it('unauthenticated signs the session out and redirects to the login with next', () => {
    const store = signedInStore();
    const thrown = thrownBy(() =>
      valueOrThrow({ ok: false, failure: { kind: 'unauthenticated' } }, REQUEST, store),
    );
    expect(store.getState().session.status).toBe('anonymous');
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?next=%2Fcampaigns%2Fabc%3Ftab%3Dx',
    );
  });

  it.each(['offline', 'unexpected', 'not_found'] as const)(
    '%s throws an ApiLoadError carrying the kind',
    (kind) => {
      const thrown = thrownBy(() =>
        valueOrThrow({ ok: false, failure: { kind } }, REQUEST, signedInStore()),
      );
      expect(thrown).toBeInstanceOf(ApiLoadError);
      expect(thrown).toMatchObject({ kind });
    },
  );
});
