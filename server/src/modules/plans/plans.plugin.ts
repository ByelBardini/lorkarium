import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { AssetReferencesDao } from '../assets/asset-references.dao';
import type { ClockPort } from '../auth/clock.port';
import { CampaignsDao } from '../campaigns/campaigns.dao';
import { PlansDao } from './plans.dao';
import { plansRoutes } from './plans.routes';
import { PlansService } from './plans.service';

export type PlansModuleOptions = Readonly<{ db: Database; clock: ClockPort }>;

export type PlansModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the plans: DAOs, service and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `await app.register(createPlansModule({ db, clock }).plugin, { prefix: '/api' })` */
export function createPlansModule(options: PlansModuleOptions): PlansModule {
  const service = new PlansService({
    accounts: new PlansDao(options.db),
    campaigns: new CampaignsDao(options.db),
    storage: new AssetReferencesDao(options.db),
    clock: options.clock,
  });
  return { plugin: plansRoutes(service) };
}
