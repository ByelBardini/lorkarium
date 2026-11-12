import { describe, expect, it } from 'vitest';
import { PLAN_LIMITS } from '@lorkarium/contracts';
import { createSessionStore, selectAccountLimits } from '@/stores/session-store';
import { ANA } from '../support/auth-api-fake';

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

  describe('selectAccountLimits', () => {
    it('reads the plan, Apoiador, limits and customization the /me gave', () => {
      const store = createSessionStore();
      const free = { ...ANA, plan: 'free', limits: PLAN_LIMITS.free } as const;
      store.getState().signedIn({ ...free, customization: true });
      expect(selectAccountLimits(store.getState())).toMatchObject({
        plan: 'free',
        limits: PLAN_LIMITS.free,
        customization: true,
      });
    });

    it('is null before the boot answers and once signed out', () => {
      const store = createSessionStore();
      expect(selectAccountLimits(store.getState())).toBeNull();
      store.getState().signedIn(ANA);
      store.getState().signedOut();
      expect(selectAccountLimits(store.getState())).toBeNull();
    });
  });
});
