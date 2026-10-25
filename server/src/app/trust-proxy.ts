import type { FastifyServerOptions } from 'fastify';

/** Fastify's `trustProxy` for `hops` proxies in front of the server: the `hops` addresses closest
 *  to the socket are believed, so `request.ip` is the one the outermost trusted proxy wrote.
 *
 *  A function, not the number: since 5.12 Fastify treats a numeric `trustProxy` as "trust nothing".
 *  The hop count cannot tell a proxy from a client that reached the port directly, so the port
 *  must only be reachable through the proxy (Coolify does not publish it; see deploy.md).
 *
 *  Example: `Fastify({ trustProxy: trustProxyOf(env.trustProxyHops) })` */
export function trustProxyOf(hops: number): FastifyServerOptions['trustProxy'] {
  if (hops === 0) return false;
  return (_address: string, hop: number): boolean => hop < hops;
}
