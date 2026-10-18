import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GuardedImageFetcher } from '../../../src/infrastructure/image-fetcher/guarded-image-fetcher';
import type { FetchOutcome } from '../../../src/modules/assets/image-fetcher.port';
import { LoopbackOnlyPolicyFake } from '../../support/assets-fakes';

const IMAGE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

function redirect(response: ServerResponse, location: string): void {
  response.writeHead(302, { location }).end();
}

function streamForever(response: ServerResponse): void {
  response.writeHead(200, { 'content-type': 'image/png' });
  const timer = setInterval(() => response.write(Buffer.alloc(512)), 1);
  response.on('close', () => clearInterval(timer));
}

function bytesOf(outcome: FetchOutcome): Buffer {
  if (!outcome.ok) throw new Error(`expected the image, got ${JSON.stringify(outcome.refusal)}`);
  return Buffer.from(outcome.image.bytes);
}

describe('GuardedImageFetcher', () => {
  let server: Server;
  let origin: string;
  let port: number;
  const loopback = new LoopbackOnlyPolicyFake();

  beforeAll(async () => {
    server = createServer((request, response) => {
      const path = request.url ?? '/';
      if (path === '/a.png')
        return response.writeHead(200, { 'content-type': 'image/png' }).end(IMAGE);
      if (path === '/once') return redirect(response, '/a.png');
      const hop = /^\/chain\/(\d+)$/.exec(path);
      if (hop) return redirect(response, `/chain/${Number(hop[1]) + 1}`);
      if (path === '/to-ipv6') return redirect(response, `http://[::1]:${port}/a.png`);
      if (path === '/endless') return streamForever(response);
      if (path === '/hang') return undefined;
      return response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
    origin = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('an allowed address answers with the bytes and the content type', async () => {
    const outcome = await new GuardedImageFetcher({ policy: loopback }).fetch(`${origin}/a.png`);

    expect(bytesOf(outcome)).toEqual(IMAGE);
    expect(outcome.ok && outcome.image.contentType).toBe('image/png');
  });

  it('a redirect to another path of the same origin is followed', async () => {
    const outcome = await new GuardedImageFetcher({ policy: loopback }).fetch(`${origin}/once`);

    expect(bytesOf(outcome)).toEqual(IMAGE);
  });

  it('the fourth redirect is refused as too many redirects', async () => {
    const outcome = await new GuardedImageFetcher({ policy: loopback }).fetch(`${origin}/chain/0`);

    expect(outcome).toEqual({
      ok: false,
      refusal: { kind: 'unreachable', reason: 'made too many redirects (more than 3)' },
    });
  });

  it('with the default policy a loopback IP literal is blocked citing the address', async () => {
    const outcome = await new GuardedImageFetcher().fetch(`${origin}/a.png`);

    expect(outcome).toEqual({
      ok: false,
      refusal: { kind: 'blocked', host: `127.0.0.1:${port}`, address: '127.0.0.1' },
    });
  });

  it('with the default policy a host name resolving to loopback is blocked in the lookup', async () => {
    const outcome = await new GuardedImageFetcher().fetch(`http://localhost:${port}/a.png`);

    expect(outcome).toMatchObject({
      ok: false,
      refusal: {
        kind: 'blocked',
        host: 'localhost',
        address: expect.stringMatching(/127\.0\.0\.1|::1/),
      },
    });
  });

  it('a redirect to the IPv6 loopback is checked again and blocked', async () => {
    const outcome = await new GuardedImageFetcher({ policy: loopback }).fetch(`${origin}/to-ipv6`);

    expect(outcome).toMatchObject({ ok: false, refusal: { kind: 'blocked', address: '::1' } });
  });

  it('a 404 is refused citing the status', async () => {
    const outcome = await new GuardedImageFetcher({ policy: loopback }).fetch(`${origin}/missing`);

    expect(outcome).toEqual({
      ok: false,
      refusal: { kind: 'unreachable', reason: 'answered HTTP 404' },
    });
  });

  it('an answer above the byte limit is cut and refused as too large', async () => {
    const fetcher = new GuardedImageFetcher({ policy: loopback, maxBytes: 4096 });

    expect(await fetcher.fetch(`${origin}/endless`)).toEqual({
      ok: false,
      refusal: { kind: 'too-large', limit: 4096, received: null },
    });
  });

  it('a server that never answers is given up citing the time limit', async () => {
    const fetcher = new GuardedImageFetcher({ policy: loopback, timeoutMs: 100 });

    expect(await fetcher.fetch(`${origin}/hang`)).toEqual({
      ok: false,
      refusal: { kind: 'unreachable', reason: 'did not answer within 100 ms' },
    });
  });

  it('a link with a scheme other than http or https is blocked', async () => {
    const outcome = await new GuardedImageFetcher({ policy: loopback }).fetch(
      'ftp://127.0.0.1/a.png',
    );

    expect(outcome).toMatchObject({
      ok: false,
      refusal: { kind: 'blocked', address: 'scheme ftp:' },
    });
  });
});
