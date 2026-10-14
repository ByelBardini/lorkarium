import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { CampaignsDao } from './campaigns.dao';
import { campaignGateway } from './campaigns.gateway';
import { campaignRoutes } from './campaigns.routes';
import { CampaignsService } from './campaigns.service';
import type { ClockPort } from './clock.port';

/** Wires the campaigns module: builds DAO and service, registers the edges.
 *
 *  Example: `app.register(campaignsPlugin, { db, clock })` */
export async function campaignsPlugin(app: FastifyInstance, options: { db: Database; clock: ClockPort }): Promise<void> {
  const service = new CampaignsService(new CampaignsDao(options.db));
  await app.register(campaignRoutes(service));
  app.decorate('campaignGateway', campaignGateway(service));
}
