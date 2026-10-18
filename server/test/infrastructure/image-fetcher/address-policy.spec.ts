import { describe, expect, it } from 'vitest';
import { isPublicAddress } from '../../../src/infrastructure/image-fetcher/address-policy';

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '2001:4860:4860::8888', '::ffff:8.8.8.8'])('%s is public', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    ['loopback', '127.0.0.1'],
    ['RFC 1918 10/8', '10.0.0.5'],
    ['RFC 1918 172.16/12', '172.16.0.1'],
    ['RFC 1918 192.168/16', '192.168.1.1'],
    ['the cloud metadata endpoint', '169.254.169.254'],
    ['CGNAT', '100.64.0.1'],
    ['the unspecified IPv4', '0.0.0.0'],
    ['the IPv6 loopback', '::1'],
    ['an IPv6 ULA', 'fc00::1'],
    ['an IPv6 link-local', 'fe80::1'],
    ['an IPv4-mapped loopback', '::ffff:127.0.0.1'],
    ['multicast', '224.0.0.1'],
  ])('%s (%s) is not public', (_range, address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it('a host name is not an address, so it is not public', () => {
    expect(isPublicAddress('example.com')).toBe(false);
  });
});
