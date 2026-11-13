import { beforeEach, describe, expect, it } from 'vitest';
import { followAccountSession } from '@/stores/account-session';
import { createSessionStore } from '@/stores/session-store';
import { ANA, ROOT_ADMIN } from '../support/auth-api-fake';

describe('followAccountSession', () => {
  let store: ReturnType<typeof createSessionStore>;
  let calls: string[];

  beforeEach(() => {
    store = createSessionStore();
    calls = [];
  });

  function follow(): () => void {
    return followAccountSession(store, {
      signedIn: (user) => calls.push(`in:${user.id}`),
      signedOut: () => calls.push('out'),
    });
  }

  it('an account already signed in when it starts following runs signedIn at once', () => {
    store.getState().signedIn(ANA);
    follow();
    expect(calls).toEqual([`in:${ANA.id}`]);
  });

  it('the boot answer anonymous runs nothing; signing in then out runs each once', () => {
    follow();
    store.getState().signedOut();
    store.getState().signedIn(ANA);
    store.getState().signedOut();
    expect(calls).toEqual([`in:${ANA.id}`, 'out']);
  });

  it('a fresh /me of the same account is not a new sign-in', () => {
    follow();
    store.getState().signedIn(ANA);
    store.getState().signedIn({ ...ANA, name: 'Ana Clara' });
    expect(calls).toEqual([`in:${ANA.id}`]);
  });

  it('another account entering without a sign-out signs the first out before', () => {
    follow();
    store.getState().signedIn(ANA);
    store.getState().signedIn(ROOT_ADMIN);
    expect(calls).toEqual([`in:${ANA.id}`, 'out', `in:${ROOT_ADMIN.id}`]);
  });

  it('after unsubscribing no transition reaches the reactions', () => {
    const stop = follow();
    stop();
    store.getState().signedIn(ANA);
    expect(calls).toEqual([]);
  });
});
