import { describe, expect, it } from 'vitest';
import { ConnectionIdentityBo } from '../../src/realtime/connection-identity.bo';

const RECHECK_AT = new Date('2026-10-22T18:00:00Z');

describe('ConnectionIdentityBo', () => {
  it('before the recheck instant the identity kept on the connection is trusted', () => {
    const check = new ConnectionIdentityBo(RECHECK_AT).checkAt(new Date('2026-10-22T17:59:59Z'));
    expect(check).toBe('trust-kept');
  });

  it('at the exact recheck instant the session is read again', () => {
    expect(new ConnectionIdentityBo(RECHECK_AT).checkAt(RECHECK_AT)).toBe('reread');
  });

  it('after the recheck instant the session is read again', () => {
    const check = new ConnectionIdentityBo(RECHECK_AT).checkAt(new Date('2026-10-23T09:00:00Z'));
    expect(check).toBe('reread');
  });
});
