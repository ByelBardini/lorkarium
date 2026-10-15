import { describe, expect, it } from 'vitest';
import { createSessionStore } from '@/stores/session-store';

const ANA = {
  id: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01',
  name: 'Ana',
  email: 'ana@mesa.com',
  role: 'user' as const,
};

describe('session store', () => {
  it('starts unknown, before the first "who am I"', () => {
    expect(createSessionStore().getState().session).toEqual({ status: 'unknown' });
  });

  it('signedIn(user) makes it authenticated with that user', () => {
    const store = createSessionStore();
    store.getState().signedIn(ANA);
    expect(store.getState().session).toEqual({ status: 'authenticated', user: ANA });
  });

  it('signedOut() after a sign-in makes it anonymous', () => {
    const store = createSessionStore();
    store.getState().signedIn(ANA);
    store.getState().signedOut();
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });
});
