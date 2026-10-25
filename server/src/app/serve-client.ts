import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { ApiErrorDto } from '@lorkarium/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// Vite names every file under assets/ by its content hash: a new build is a new URL.
const HASHED_FOLDER = 'assets';
const IMMUTABLE = 'public, max-age=31536000, immutable';
// The index (and the rest of the root) is revalidated on every load, or a deploy would leave
// players on an index that points at hashed files the new image no longer has.
const REVALIDATE = 'no-cache';
const SPA_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);
const RESERVED_PREFIXES = ['/api/', `/${HASHED_FOLDER}/`];

/** Serves the Vite build in `dir` on the same origin as the API: the files themselves, and the
 *  index.html for any other GET outside `/api` and `/assets` (the React Router deep links).
 *
 *  Example: `if (env.clientDistDir) await serveClient(app, env.clientDistDir)` */
export async function serveClient(app: FastifyInstance, dir: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: dir,
    // One route per file found at boot: the build never changes while the container runs.
    wildcard: false,
    cacheControl: false,
    setHeaders: (reply, file) => reply.header('cache-control', cacheControlOf(dir, file)),
  });
  app.setNotFoundHandler(async (request, reply) => answerNotFound(request, reply));
}

function cacheControlOf(dir: string, file: string): string {
  const [top] = path.relative(dir, file).split(path.sep);
  return top === HASHED_FOLDER ? IMMUTABLE : REVALIDATE;
}

async function answerNotFound(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  if (!fallsBackToIndex(request)) return reply.code(404).send(routeNotFound(request));
  reply.header('cache-control', REVALIDATE);
  return reply.type('text/html; charset=utf-8').sendFile('index.html');
}

// A missing /assets file must stay a 404: HTML answered for a script tag would run as one.
function fallsBackToIndex(request: FastifyRequest): boolean {
  if (!SPA_METHODS.has(request.method)) return false;
  const pathname = request.url.split('?')[0] ?? '';
  return !RESERVED_PREFIXES.some((prefix) => `${pathname}/`.startsWith(prefix));
}

function routeNotFound(request: FastifyRequest): ApiErrorDto {
  return {
    code: 'ROUTE_NOT_FOUND',
    message: `no route ${request.method} ${request.url}; expected an /api route or a client page`,
  };
}
