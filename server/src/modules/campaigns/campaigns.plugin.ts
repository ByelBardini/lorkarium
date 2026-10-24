import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import { AssetsDao } from '../assets/assets.dao';
import { ConditionsDao } from '../conditions/conditions.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import { CachedMemberships } from './cached-memberships';
import type { CampaignChangedPort } from './campaign-changed.port';
import type { CampaignCodePort } from './campaign-code.port';
import { CampaignJoinService } from './campaign-join.service';
import { CampaignSettingsService } from './campaign-settings.service';
import { CampaignMembersDao } from './campaign-members.dao';
import { CampaignsDao } from './campaigns.dao';
import { campaignsRoutes } from './campaigns.routes';
import { CampaignsService, type CampaignTransactionRunner } from './campaigns.service';
import type { PresenceReaderPort } from './presence-reader.port';

export type CampaignsModuleOptions = Readonly<{
  db: Database;
  hasher: PasswordHasherPort;
  codes: CampaignCodePort;
  clock: ClockPort;
  presence: PresenceReaderPort;
}>;

export type CampaignsModule = Readonly<{
  /** The HTTP edge, made once the live session exists: it is told of each saved change, and it
   *  is built after this module (it reads the members through `service`). */
  pluginWith: (changed: CampaignChangedPort) => (app: FastifyInstance) => Promise<void>;
  /** For other modules: the live session asks it who the members of a table are. */
  service: CampaignsService;
  /** For the board modules: who is a member of a table, remembered (see `CachedMemberships`). */
  memberships: CachedMemberships;
}>;

/** Wires the campaigns module: DAOs, the services and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `const campaigns = createCampaignsModule(options); await app.register(campaigns.pluginWith(sessions.service), { prefix: '/api' })` */
export function createCampaignsModule(options: CampaignsModuleOptions): CampaignsModule {
  const campaigns = new CampaignsDao(options.db);
  const members = new CampaignMembersDao(options.db);
  const transaction = transactionOver(options.db);
  const { hasher, codes, clock, presence } = options;
  const memberships = new CachedMemberships(members);
  const scenes = new ScenesDao(options.db);
  const readDeps = { campaigns, members, scenes, memberships, presence };
  const service = new CampaignsService({ ...readDeps, transaction, codes, hasher, clock });
  const join = new CampaignJoinService({ campaigns, members, hasher, clock });
  const assets = new AssetsDao(options.db);
  const pluginWith = (changed: CampaignChangedPort): ((app: FastifyInstance) => Promise<void>) => {
    const settingsDeps = { campaigns, members, assets, memberships, changed, codes, hasher, clock };
    const settings = new CampaignSettingsService({ ...settingsDeps, presence, detail: service });
    return campaignsRoutes({ campaigns: service, join, settings });
  };
  return { pluginWith, service, memberships };
}

function transactionOver(db: Database): CampaignTransactionRunner {
  return (work) =>
    runInTransaction(db, (tx) =>
      work({
        campaigns: new CampaignsDao(tx),
        members: new CampaignMembersDao(tx),
        scenes: new ScenesDao(tx),
        conditions: new ConditionsDao(tx),
      }),
    );
}
