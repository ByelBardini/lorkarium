import { describe, expect, it } from 'vitest';
import { createSessionStore } from '@/stores/session-store';

const ANA = {
  id: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01',
  username: 'ana',
  name: 'Ana',
  email: 'ana@mesa.com',
  role: 'user' as const,
  color: 'teal' as const,
  avatarId: null,
};

describe('session store', () => {
  it('starts unknown and not reconnecting, before the first "who am I"', () => {
    expect(createSessionStore().getState().session).toEqual({
      status: 'unknown',
      reconnecting: false,
    });
  });

  it('serverUnreachable() keeps it unknown, now reconnecting', () => {
    const store = createSessionStore();
    store.getState().serverUnreachable();
    expect(store.getState().session).toEqual({ status: 'unknown', reconnecting: true });
  });

  it('serverUnreachable() leaves a known session as it is', () => {
    const store = createSessionStore();
    store.getState().signedIn(ANA);
    store.getState().serverUnreachable();
    expect(store.getState().session).toEqual({ status: 'authenticated', user: ANA });
  });

  it('signedIn(user) after reconnecting makes it authenticated', () => {
    const store = createSessionStore();
    store.getState().serverUnreachable();
    store.getState().signedIn(ANA);
    expect(store.getState().session).toEqual({ status: 'authenticated', user: ANA });
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
