import { describe, expect, it } from 'vitest';
import { InMemoryAccountPresenceRegistry } from '../../../src/infrastructure/account-presence-registry/in-memory-account-presence-registry';
import {
  AccountPresenceBo,
  EMPTY_ACCOUNT_PRESENCE,
} from '../../../src/modules/account-presence/account-presence.bo';

const USER_ID = 'b1a00000-0000-4000-8000-000000000001';

describe('InMemoryAccountPresenceRegistry', () => {
  it('an account nobody saved has no presence', () => {
    expect(new InMemoryAccountPresenceRegistry().presenceOf(USER_ID)).toBeUndefined();
  });

  it('returns the presence saved for the account', () => {
    const registry = new InMemoryAccountPresenceRegistry();
    const state = new AccountPresenceBo(EMPTY_ACCOUNT_PRESENCE).connect('s1').state;
    registry.save(USER_ID, state);
    expect(registry.presenceOf(USER_ID)).toBe(state);
  });

  it('drops an account with no socket nor grace', () => {
    const registry = new InMemoryAccountPresenceRegistry();
    const online = new AccountPresenceBo(EMPTY_ACCOUNT_PRESENCE).connect('s1').state;
    registry.save(USER_ID, online);
    registry.save(USER_ID, new AccountPresenceBo(online).disconnect('s1', 'left').state);
    expect(registry.presenceOf(USER_ID)).toBeUndefined();
    expect(registry.accountCount()).toBe(0);
  });

  it('keeps an account inside the grace', () => {
    const registry = new InMemoryAccountPresenceRegistry();
    const online = new AccountPresenceBo(EMPTY_ACCOUNT_PRESENCE).connect('s1').state;
    registry.save(USER_ID, new AccountPresenceBo(online).disconnect('s1', 'dropped').state);
    expect(registry.accountCount()).toBe(1);
  });
});
