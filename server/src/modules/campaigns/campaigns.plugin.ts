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
import { JuggernautService } from './juggernaut.service';
import type { MemberRemovedPort } from './member-removed.port';
import type { MemberRoleChangedPort } from './member-role-changed.port';
import { MemberRoleService } from './member-role.service';
import type { PresenceReaderPort } from './presence-reader.port';

export type CampaignsModuleOptions = Readonly<{
  db: Database;
  hasher: PasswordHasherPort;
  codes: CampaignCodePort;
  clock: ClockPort;
  presence: PresenceReaderPort;
}>;

/** What the live table is told after each saved change. */
export type CampaignOutlets = Readonly<{
  changed: CampaignChangedPort;
  roleChanged: MemberRoleChangedPort;
  removed: MemberRemovedPort;
}>;

export type CampaignsModule = Readonly<{
  /** The HTTP edge, made once the live session exists: it is told of each saved change (of the
   *  campaign, of a member's role, of a member taken out), and it is built after this module (it
   *  reads the members through `service`). */
  pluginWith: (outlets: CampaignOutlets) => (app: FastifyInstance) => Promise<void>;
  /** Built with the edge: the backoffice turns off the juggernaut of an account losing admin. */
  juggernaut: () => JuggernautService;
  /** For other modules: the live session asks it who the members of a table are. */
  service: CampaignsService;
  /** For the board modules: who is a member of a table, remembered (see `CachedMemberships`). */
  memberships: CachedMemberships;
}>;

/** Wires the campaigns module: DAOs, the services and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `const campaigns = createCampaignsModule(options); await app.register(campaigns.pluginWith(sessions.service, sessions.service), { prefix: '/api' })` */
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
  let juggernaut: JuggernautService | null = null;
  const pluginWith = (outlets: CampaignOutlets): ((app: FastifyInstance) => Promise<void>) => {
    const { changed, roleChanged, removed } = outlets;
    const settingsDeps = { campaigns, members, assets, memberships, changed, codes, hasher, clock };
    const settings = new CampaignSettingsService({ ...settingsDeps, presence, detail: service });
    const roleDeps = { campaigns, members, memberships, presence };
    const roles = new MemberRoleService({ ...roleDeps, changed: roleChanged });
    const writes = { campaigns, members, memberships, clock, detail: service };
    juggernaut = new JuggernautService({ ...writes, changed: roleChanged, removed });
    return campaignsRoutes({ campaigns: service, join, settings, roles, juggernaut });
  };
  const juggernautOf = (): JuggernautService => {
    if (juggernaut) return juggernaut;
    throw new Error('the juggernaut service exists once pluginWith(outlets) ran; got none yet');
  };
  return { pluginWith, juggernaut: juggernautOf, service, memberships };
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
