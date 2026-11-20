import { describe, expect, it } from 'vitest';
import { AccountVisibilityRelay } from '../../src/app/account-visibility-relay';
import { AccountVisibilityFake } from '../support/campaign-settings-fakes';

describe('AccountVisibilityRelay', () => {
  it('before the presence is attached, nobody shows online', () => {
    expect(new AccountVisibilityRelay().isVisiblyOnline('bia')).toBe(false);
  });

  it('once attached, answers what the account presence says', () => {
    const relay = new AccountVisibilityRelay();
    relay.attach(new AccountVisibilityFake(['bia']));
    expect(relay.isVisiblyOnline('bia')).toBe(false);
    expect(relay.isVisiblyOnline('caio')).toBe(true);
  });
});
