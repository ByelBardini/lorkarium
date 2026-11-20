import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keepOutOfSearch, SEARCH_NOINDEX } from '../../src/app/search-noindex';
import { serveClient } from '../../src/app/serve-client';

// The real robots.txt the client build copies from client/public/.
const CLIENT_ROBOTS = fileURLToPath(new URL('../../../client/public/robots.txt', import.meta.url));

let distDir: string;
let app: FastifyInstance;

function fakeClientBuild(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'lorkarium-noindex-'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Lorkarium</title>');
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'assets', 'main.abc123.js'), 'console.log(1);');
  copyFileSync(CLIENT_ROBOTS, path.join(dir, 'robots.txt'));
  return dir;
}

beforeEach(async () => {
  distDir = fakeClientBuild();
  app = Fastify();
  keepOutOfSearch(app);
  app.get('/api/ping', async () => ({ ok: true }));
  await serveClient(app, distDir);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(distDir, { recursive: true, force: true });
});

describe('keepOutOfSearch', () => {
  it('marks an API answer as noindex', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/ping' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-robots-tag']).toBe(SEARCH_NOINDEX);
    expect(SEARCH_NOINDEX).toBe('noindex, nofollow');
  });

  it('marks the SPA fallback of a deep link as noindex', async () => {
    const response = await app.inject({ method: 'GET', url: '/campaigns/x' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.headers['x-robots-tag']).toBe(SEARCH_NOINDEX);
  });

  it('marks an API 404 and a hashed asset as noindex too', async () => {
    const notFound = await app.inject({ method: 'GET', url: '/api/nada' });
    const asset = await app.inject({ method: 'GET', url: '/assets/main.abc123.js' });

    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers['x-robots-tag']).toBe(SEARCH_NOINDEX);
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['x-robots-tag']).toBe(SEARCH_NOINDEX);
  });

  it('serves a robots.txt that allows crawling, so the noindex header can be read', async () => {
    const response = await app.inject({ method: 'GET', url: '/robots.txt' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatch(/^User-agent: \*$/m);
    expect(response.body).toMatch(/^Allow: \/$/m);
    expect(response.body).not.toMatch(/^Disallow: \/\s*$/m);
  });
});
