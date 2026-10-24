import type { FastifyInstance } from 'fastify';
import {
  createAccountLinksModule,
  type AccountLinksModuleOptions,
} from '../modules/account-links/account-links.plugin';
import {
  createUserAdminModule,
  type UserAdminModuleOptions,
} from '../modules/user-admin/user-admin.plugin';

/** What `buildApp` already has for the backoffice: the links module's needs plus the deletion's
 *  (memberships to forget, the bucket of the photos). */
export type BackofficeWiring = AccountLinksModuleOptions &
  Pick<UserAdminModuleOptions, 'memberships' | 'storage' | 'mailer'>;

/** Registers the invitation and new-password links and the backoffice over the accounts under
 *  `prefix`; the account list reads the pending invitations from the links module.
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
    storage,
    notices,
    cipher,
    clock,
    appPublicUrl,
    mailer,
  });
  await app.register(userAdmin.plugin, { prefix });
}
