import { BlockList, isIP } from 'node:net';

/** Decides which resolved address a link may connect to. */
export interface AddressPolicy {
  allows(address: string): boolean;
}

// Every range that is not the public internet: loopback, RFC 1918, CGNAT, link-local (the
// 169.254.169.254 metadata endpoint), documentation, benchmarking, multicast and reserved.
const NOT_PUBLIC_V4: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

// Unspecified/IPv4-compatible, loopback, NAT64, documentation, ULA, link-local and multicast.
// IPv4-mapped (::ffff:a.b.c.d) needs no entry: BlockList checks it against the IPv4 ranges.
const NOT_PUBLIC_V6: readonly (readonly [string, number])[] = [
  ['::', 96],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

const notPublic = new BlockList();
for (const [network, prefix] of NOT_PUBLIC_V4) notPublic.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of NOT_PUBLIC_V6) notPublic.addSubnet(network, prefix, 'ipv6');

/** Whether an IP literal is on the public internet; anything that is not an IP is not public.
 *
 *  Example: `isPublicAddress('169.254.169.254') // false` */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !notPublic.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** The policy of production: only public addresses. */
export const publicAddressPolicy: AddressPolicy = { allows: isPublicAddress };
