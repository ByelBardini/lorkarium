import { describe, expect, it } from 'vitest';
import { clientAddressOf } from '../../src/realtime/client-address';

const TRAEFIK = '10.0.1.5';

// The same answers Fastify's request.ip gives under trustProxyOf(hops) (proxy-addr).
describe('clientAddressOf', () => {
  it('with 0 trusted hops the socket address wins over any X-Forwarded-For', () => {
    expect(clientAddressOf(TRAEFIK, '203.0.113.7', 0)).toBe(TRAEFIK);
  });

  it('with 1 trusted hop the address the proxy appended (the rightmost) is the client', () => {
    expect(clientAddressOf(TRAEFIK, '203.0.113.7', 1)).toBe('203.0.113.7');
  });

  it('with 1 trusted hop an address the client wrote first is never believed', () => {
    expect(clientAddressOf(TRAEFIK, '198.51.100.1, 203.0.113.7', 1)).toBe('203.0.113.7');
  });

  it('with 2 trusted hops (Cloudflare + Traefik) the second from the right is the client', () => {
    expect(clientAddressOf(TRAEFIK, '198.51.100.1,203.0.113.7, 172.68.0.9', 2)).toBe('203.0.113.7');
  });

  it('more trusted hops than addresses stop at the farthest one the header has', () => {
    expect(clientAddressOf(TRAEFIK, '203.0.113.7', 3)).toBe('203.0.113.7');
  });

  it('without the header the socket address is the client, whatever the hops', () => {
    expect(clientAddressOf('203.0.113.7', undefined, 1)).toBe('203.0.113.7');
  });

  it('repeated headers read as one list, empty entries skipped', () => {
    expect(clientAddressOf(TRAEFIK, ['198.51.100.1', ' , 203.0.113.7 '], 1)).toBe('203.0.113.7');
  });
});
