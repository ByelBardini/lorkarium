import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import { ConditionsDao } from '../conditions/conditions.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import { CachedMemberships } from './cached-memberships';
import type { CampaignCodePort } from './campaign-code.port';
import { CampaignJoinService } from './campaign-join.service';
import { CampaignMembersDao } from './campaign-members.dao';
import { CampaignsDao } from './campaigns.dao';
import { campaignsRoutes } from './campaigns.routes';
import { CampaignsService, type CampaignTransactionRunner } from './campaigns.service';

export type CampaignsModuleOptions = Readonly<{
  db: Database;
  hasher: PasswordHasherPort;
  codes: CampaignCodePort;
  clock: ClockPort;
}>;

export type CampaignsModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  /** For other modules: the live session asks it who the members of a table are. */
  service: CampaignsService;
  /** For the board modules: who is a member of a table, remembered (see `CachedMemberships`). */
  memberships: CachedMemberships;
}>;

/** Wires the campaigns module: DAOs, both services and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `const campaigns = createCampaignsModule(options); await app.register(campaigns.plugin, { prefix: '/api' })` */
export function createCampaignsModule(options: CampaignsModuleOptions): CampaignsModule {
  const campaigns = new CampaignsDao(options.db);
  const members = new CampaignMembersDao(options.db);
  const transaction: CampaignTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        campaigns: new CampaignsDao(tx),
        members: new CampaignMembersDao(tx),
        scenes: new ScenesDao(tx),
        conditions: new ConditionsDao(tx),
      }),
    );
  const { hasher, codes, clock } = options;
  const memberships = new CachedMemberships(members);
  const scenes = new ScenesDao(options.db);
  const serviceDeps = {
    campaigns,
    members,
    scenes,
    memberships,
    transaction,
    codes,
    hasher,
    clock,
  };
  const service = new CampaignsService(serviceDeps);
  const join = new CampaignJoinService({ campaigns, members, hasher, clock });
  return { plugin: campaignsRoutes({ campaigns: service, join }), service, memberships };
}
