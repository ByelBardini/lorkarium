import type { FastifyInstance } from 'fastify';
import type { BadgesModule } from '../modules/badges/badges.plugin';
import {
  createAccountLinksModule,
  type AccountLinksModuleOptions,
} from '../modules/account-links/account-links.plugin';
import {
  createUserAdminModule,
  type UserAdminModuleOptions,
} from '../modules/user-admin/user-admin.plugin';

/** What `buildApp` already has for the backoffice: the links module's needs plus the deletion's
 *  (memberships to forget, the bucket of the photos), and the badges module (built earlier: the
 *  profiles read the badges through its service). */
export type BackofficeWiring = AccountLinksModuleOptions &
  Pick<
    UserAdminModuleOptions,
    'memberships' | 'juggernauts' | 'profiles' | 'ownedTables' | 'storage' | 'mailer'
  > &
  Readonly<{ badges: BadgesModule }>;

/** Registers the invitation and new-password links, the backoffice over the accounts and the
 *  badge catalog under `prefix`; the account list reads the pending invitations from the links
 *  module.
 *
 *  Example: `await wireBackoffice(app, { ...shared, memberships, storage }, '/api')` */
export async function wireBackoffice(
  app: FastifyInstance,
  wiring: BackofficeWiring,
  prefix: string,
): Promise<void> {
  const links = createAccountLinksModule(wiring);
  await app.register(links.plugin, { prefix });
  const { memberships, storage, mailer, db, sessionEnded, notices, cipher, clock, appPublicUrl } =
    wiring;
  const userAdmin = createUserAdminModule({
    db,
    invitations: links.invitations,
    sessionEnded,
    memberships,
    juggernauts: wiring.juggernauts,
    profiles: wiring.profiles,
    ownedTables: wiring.ownedTables,
    storage,
    notices,
    cipher,
    clock,
    appPublicUrl,
    mailer,
  });
  await app.register(userAdmin.plugin, { prefix });
  await app.register(wiring.badges.plugin, { prefix });
}
