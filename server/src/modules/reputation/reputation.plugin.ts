import { REPUTATION_MIN_VOTES } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { UsersDao } from '../auth/users.dao';
import { ReputationDao } from './reputation.dao';
import { reputationRoutes } from './reputation.routes';
import { ReputationService } from './reputation.service';

export type ReputationModuleOptions = Readonly<{ db: Database }>;

export type ReputationModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  /** For the profile card: `summaryOf(target, viewer)` and `shareCampaign(a, b)`. */
  service: ReputationService;
}>;

/** Wires the reputation: DAO, service and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `await app.register(createReputationModule({ db }).plugin, { prefix: '/api' })` */
export function createReputationModule(options: ReputationModuleOptions): ReputationModule {
  const votes = new ReputationDao(options.db);
  const service = new ReputationService({
    votes,
    accounts: new UsersDao(options.db),
    minVotes: REPUTATION_MIN_VOTES,
  });
  return { plugin: reputationRoutes(service), service };
}
