import { describe, expect, it } from 'vitest';
import { trustProxyOf } from '../../src/app/trust-proxy';

function trusts(hops: number, hop: number): boolean {
  const trust = trustProxyOf(hops);
  if (typeof trust !== 'function')
    throw new Error(`expected a trust function, got ${String(trust)}`);
  return trust('10.0.1.5', hop);
}

describe('trustProxyOf', () => {
  it('0 hops trusts no proxy at all', () => {
    expect(trustProxyOf(0)).toBe(false);
  });

  it('1 hop believes the socket peer and nothing behind it', () => {
    expect(trusts(1, 0)).toBe(true);
    expect(trusts(1, 1)).toBe(false);
  });

  it('2 hops believe the two addresses closest to the socket', () => {
    expect(trusts(2, 1)).toBe(true);
    expect(trusts(2, 2)).toBe(false);
  });
});
