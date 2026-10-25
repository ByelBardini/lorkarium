import { legalDocumentDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { landingPageUrlOf } from './legal.mapper';

/** HTTP edge of the legal links: `GET /legal/terms` and `/legal/privacy` answer 302 to the landing
 *  page, so the client links to its own origin and never needs the landing address.
 *
 *  Example: `app.register(legalRoutes('https://example.com'))` */
export function legalRoutes(sitePublicUrl: string): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    // Public on purpose: the login and the invitation link to them before any session exists.
    for (const document of legalDocumentDto.options) {
      const target = landingPageUrlOf(sitePublicUrl, document);
      app.get(`/legal/${document}`, (_request, reply) => reply.redirect(target, 302));
    }
  };
}
