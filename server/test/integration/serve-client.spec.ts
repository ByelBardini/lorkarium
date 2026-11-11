import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from 'node:zlib';
import { apiErrorDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { openTestDatabase } from '../support/test-database';

const INDEX_HTML = '<!doctype html><html><body><div id="root"></div></body></html>';
const APP_SCRIPT = 'console.log("lorkarium");';

/** A stand-in for `client/dist`: the index and one hashed script, as `vite build` lays them out. */
async function fakeClientBuild(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lorkarium-client-dist-'));
  await mkdir(path.join(dir, 'assets'));
  await writeFile(path.join(dir, 'index.html'), INDEX_HTML);
  await writeFile(path.join(dir, 'assets', 'app-3f2a.js'), APP_SCRIPT);
  return dir;
}

describe('the server serves the client build (CLIENT_DIST_DIR)', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;
  let clientDist: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    connection = await openTestDatabase();
    clientDist = await fakeClientBuild();
    app = await buildApp({ env: { ...env, clientDistDir: clientDist }, db: connection.db });
  });

  afterAll(async () => {
    await app.close();
    await connection.close();
    await rm(clientDist, { recursive: true, force: true });
  });

  it('GET / answers the index.html, revalidated on every load', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toBe(INDEX_HTML);
  });

  it('a hashed asset is cached for a year as immutable', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/app-3f2a.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^(text|application)\/javascript/);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.body).toBe(APP_SCRIPT);
  });

  it('a React Router deep link answers the index.html', async () => {
    const response = await app.inject({ method: 'GET', url: '/campaigns/abc/scenes/1' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toBe(INDEX_HTML);
  });

  it('an unknown /api route answers a JSON 404, never the HTML', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/nao-existe' });
    expect(response.statusCode).toBe(404);
    expect(apiErrorDto.parse(response.json()).code).toBe('ROUTE_NOT_FOUND');
  });

  it('a POST outside /api answers a JSON 404: only GET and HEAD fall back to the SPA', async () => {
    const response = await app.inject({ method: 'POST', url: '/campaigns' });
    expect(response.statusCode).toBe(404);
    expect(apiErrorDto.parse(response.json()).code).toBe('ROUTE_NOT_FOUND');
  });

  it('a missing asset answers 404 without the fallback, so no HTML runs as a script', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/sumiu.js' });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('<div id="root">');
  });
});

const BIG_SCRIPT = 'console.log("lorkarium");\n'.repeat(200);

/** A build after `client/scripts/precompress.mjs`: each text file next to its `.br` and `.gz`. */
async function precompressedClientBuild(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lorkarium-client-dist-br-'));
  await mkdir(path.join(dir, 'assets'));
  const files: readonly (readonly [string, string])[] = [
    ['index.html', INDEX_HTML],
    [path.join('assets', 'app-3f2a.js'), BIG_SCRIPT],
  ];
  for (const [name, text] of files) {
    await writeFile(path.join(dir, name), text);
    await writeFile(path.join(dir, `${name}.br`), brotliCompressSync(text));
    await writeFile(path.join(dir, `${name}.gz`), gzipSync(text));
  }
  return dir;
}

describe('the server serves the pre-compressed build by Accept-Encoding', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;
  let clientDist: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    connection = await openTestDatabase();
    clientDist = await precompressedClientBuild();
    app = await buildApp({ env: { ...env, clientDistDir: clientDist }, db: connection.db });
  });

  afterAll(async () => {
    await app.close();
    await connection.close();
    await rm(clientDist, { recursive: true, force: true });
  });

  function scriptWith(acceptEncoding: string | undefined) {
    const headers = acceptEncoding === undefined ? {} : { 'accept-encoding': acceptEncoding };
    return app.inject({ method: 'GET', url: '/assets/app-3f2a.js', headers });
  }

  it('serves the .br when brotli is accepted, immutable and varying by the encoding', async () => {
    const response = await scriptWith('gzip, deflate, br');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-encoding']).toBe('br');
    expect(response.headers['vary']).toMatch(/accept-encoding/i);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(brotliDecompressSync(response.rawPayload).toString()).toBe(BIG_SCRIPT);
  });

  it('serves the .gz when only gzip is accepted', async () => {
    const response = await scriptWith('gzip');

    expect(response.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(response.rawPayload).toString()).toBe(BIG_SCRIPT);
  });

  it('serves the raw file when no encoding is accepted', async () => {
    const response = await scriptWith(undefined);

    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.body).toBe(BIG_SCRIPT);
  });

  it('a deep link answers the compressed index.html, revalidated on every load', async () => {
    const headers = { 'accept-encoding': 'br' };
    const response = await app.inject({ method: 'GET', url: '/campaigns/abc', headers });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-encoding']).toBe('br');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(brotliDecompressSync(response.rawPayload).toString()).toBe(INDEX_HTML);
  });
});

describe('without CLIENT_DIST_DIR (dev, tests, e2e)', () => {
  it('GET / answers 404 as before', async () => {
    const connection = await openTestDatabase();
    const env: Env = { ...readEnv(process.env), adminSeed: null, clientDistDir: null };
    const app = await buildApp({ env, db: connection.db });
    const response = await app.inject({ method: 'GET', url: '/' });
    await app.close();
    await connection.close();
    expect(response.statusCode).toBe(404);
  });
});
