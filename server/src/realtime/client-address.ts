/** The client's IP as `request.ip` gives it under `trustProxyOf(hops)`: the address `hops` steps
 *  from the socket along X-Forwarded-For (read from the right), or the farthest one the header
 *  has. The Socket.IO handshake skips Fastify, so this is how it gets the same IP.
 *
 *  Example: `clientAddressOf('10.0.1.5', '198.51.100.1, 203.0.113.7', 1) // '203.0.113.7'` */
export function clientAddressOf(
  socketAddress: string,
  forwardedFor: string | readonly string[] | undefined,
  hops: number,
): string {
  const chain = [socketAddress, ...forwardedAddresses(forwardedFor).reverse()];
  return chain[Math.min(hops, chain.length - 1)] ?? socketAddress;
}

function forwardedAddresses(header: string | readonly string[] | undefined): string[] {
  if (header === undefined) return [];
  const joined = typeof header === 'string' ? header : header.join(',');
  return joined
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address !== '');
}
