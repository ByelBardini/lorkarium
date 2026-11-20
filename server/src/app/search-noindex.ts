import type { FastifyInstance } from 'fastify';

/** The X-Robots-Tag of every answer of the app: the landing is what search shows. */
export const SEARCH_NOINDEX = 'noindex, nofollow';

/** Marks every response of the app (API, SPA, files, errors) as kept out of search results. The
 *  robots.txt still allows crawling on purpose: a blocked URL is never fetched, so Google would
 *  not see this header and could index the bare URL.
 *
 *  Example: `keepOutOfSearch(app)` right after `Fastify()`, before any plugin */
export function keepOutOfSearch(app: FastifyInstance): void {
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-robots-tag', SEARCH_NOINDEX);
    return payload;
  });
}
