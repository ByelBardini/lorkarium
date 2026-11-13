import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction, type Transaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import { UsersDao } from '../auth/users.dao';
import type { AssetRemovalLog } from '../assets/asset-object-removal';
import type { AssetStoragePort } from '../assets/asset-storage.port';
import { AssetsDao } from '../assets/assets.dao';
import { ConditionsDao } from '../conditions/conditions.dao';
import { UserBlocksDao } from '../friends/user-blocks.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import { CachedMemberships } from './cached-memberships';
import type { CampaignChangedPort } from './campaign-changed.port';
import type { CampaignCodePort } from './campaign-code.port';
import { CampaignJoinService, type CampaignJoinTransactionRunner } from './campaign-join.service';
import {
  CampaignSettingsService,
  type CampaignRemovalTransactionRunner,
} from './campaign-settings.service';
import { CampaignMembersDao } from './campaign-members.dao';
import { CampaignsDao } from './campaigns.dao';
import { campaignsRoutes } from './campaigns.routes';
import { CampaignsService, type CampaignTransactionRunner } from './campaigns.service';
import { JuggernautService, type JuggernautTransactionRunner } from './juggernaut.service';
import type { MemberRemovedPort } from './member-removed.port';
import type { MemberRoleChangedPort } from './member-role-changed.port';
import { MemberRoleService, type MemberRoleTransactionRunner } from './member-role.service';
import type { MemberSeatPort } from './member-seat.port';
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
  /** The seat (character) of a member, bound to the role's transaction. */
  seatIn: (tx: Transaction) => MemberSeatPort;
  /** Where the objects of a deleted table's files are removed (the asset bucket). */
  objects: Pick<AssetStoragePort, 'remove'>;
  log: AssetRemovalLog;
}>;

export type CampaignsModule = Readonly<{
  /** The HTTP edge, made once the live session exists: it is told of each saved change (of the
   *  campaign, of a member's role, of a member taken out), and it is built after this module (it
   *  reads the members through `service`). */
  pluginWith: (outlets: CampaignOutlets) => (app: FastifyInstance) => Promise<void>;
  /** Built with the edge: the backoffice tells the tables about the seats it revoked. */
  juggernaut: () => JuggernautService;
  /** Built with the edge: the backoffice tells the tables of an owner about their new limits. */
  settings: () => CampaignSettingsService;
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
  const readDeps = { campaigns, members, memberships, presence };
  const service = new CampaignsService({ ...readDeps, transaction, codes, hasher, clock });
  const joinDeps = { campaigns, members, hasher, clock, blocks: new UserBlocksDao(options.db) };
  const join = new CampaignJoinService({
    ...joinDeps,
    transaction: campaignJoinTransactionOver(options.db),
  });
  const assets = new AssetsDao(options.db);
  let juggernaut: JuggernautService | null = null;
  let settings: CampaignSettingsService | null = null;
  const pluginWith = (outlets: CampaignOutlets): ((app: FastifyInstance) => Promise<void>) => {
    const { changed, roleChanged, removed, seatIn, objects, log } = outlets;
    const settingsDeps = { campaigns, members, assets, memberships, changed, codes, hasher, clock };
    const removal = removalTransactionOver(options.db);
    const deletion = { removal, objects, log };
    settings = new CampaignSettingsService({
      ...settingsDeps,
      ...deletion,
      presence,
      detail: service,
    });
    const roleDeps = { campaigns, members, memberships, presence };
    const transaction = memberRoleTransactionOver(options.db, seatIn);
    const roles = new MemberRoleService({ ...roleDeps, transaction, changed: roleChanged });
    const writes = { campaigns, members, memberships, clock, detail: service };
    juggernaut = new JuggernautService({
      ...writes,
      transaction: juggernautTransactionOver(options.db),
      changed: roleChanged,
      removed,
    });
    return campaignsRoutes({ campaigns: service, join, settings, roles, juggernaut });
  };
  const juggernautOf = (): JuggernautService => {
    if (juggernaut) return juggernaut;
    throw new Error('the juggernaut service exists once pluginWith(outlets) ran; got none yet');
  };
  const settingsOf = (): CampaignSettingsService => {
    if (settings) return settings;
    throw new Error('the settings service exists once pluginWith(outlets) ran; got none yet');
  };
  return { pluginWith, juggernaut: juggernautOf, settings: settingsOf, service, memberships };
}

function transactionOver(db: Database): CampaignTransactionRunner {
  return (work) =>
    runInTransaction(db, (tx) =>
      work({
        owners: new UsersDao(tx),
        campaigns: new CampaignsDao(tx),
        members: new CampaignMembersDao(tx),
        scenes: new ScenesDao(tx),
        conditions: new ConditionsDao(tx),
      }),
    );
}

function removalTransactionOver(db: Database): CampaignRemovalTransactionRunner {
  return (work) =>
    runInTransaction(db, (tx) =>
      work({ campaigns: new CampaignsDao(tx), assets: new AssetsDao(tx) }),
    );
}

function juggernautTransactionOver(db: Database): JuggernautTransactionRunner {
  return (work) =>
    runInTransaction(db, (tx) =>
      work({ members: new CampaignMembersDao(tx), users: new UsersDao(tx) }),
    );
}

/** The role's transaction: the membership and the member's seat on the same `tx`.
 *
 *  Example: `new MemberRoleService({ …, transaction: memberRoleTransactionOver(db, characters.seatIn) })` */
export function memberRoleTransactionOver(
  db: Database,
  seatIn: (tx: Transaction) => MemberSeatPort,
): MemberRoleTransactionRunner {
  return (work) =>
    runInTransaction(db, (tx) =>
      work({
        campaigns: new CampaignsDao(tx),
        members: new CampaignMembersDao(tx),
        seat: seatIn(tx),
      }),
    );
}

/** A newcomer's seat: the table locked with its owner's plan, counted and inserted on one `tx`.
 *
 *  Example: `new CampaignJoinService({ …, transaction: campaignJoinTransactionOver(db) })` */
export function campaignJoinTransactionOver(db: Database): CampaignJoinTransactionRunner {
  return (work) =>
    runInTransaction(db, (tx) =>
      work({ campaigns: new CampaignsDao(tx), members: new CampaignMembersDao(tx) }),
    );
}
