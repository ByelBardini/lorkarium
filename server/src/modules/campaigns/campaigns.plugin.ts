import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
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

/** Wires the campaigns module: DAOs, both services and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `await app.register(createCampaignsModule({ db, hasher, codes, clock }), { prefix: '/api' })` */
export function createCampaignsModule(
  options: CampaignsModuleOptions,
): (app: FastifyInstance) => Promise<void> {
  const campaigns = new CampaignsDao(options.db);
  const members = new CampaignMembersDao(options.db);
  const transaction: CampaignTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({ campaigns: new CampaignsDao(tx), members: new CampaignMembersDao(tx) }),
    );
  const { hasher, codes, clock } = options;
  return campaignsRoutes({
    campaigns: new CampaignsService({ campaigns, members, transaction, codes, hasher, clock }),
    join: new CampaignJoinService({ campaigns, members, hasher, clock }),
  });
}
