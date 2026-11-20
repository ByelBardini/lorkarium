import type { FastifyInstance } from 'fastify';
import type { BadgesModule } from '../modules/badges/badges.plugin';
import {
  createAccountLinksModule,
  type AccountLinksModuleOptions,
} from '../modules/account-links/account-links.plugin';
import type { SecurityNoticesService } from '../modules/account-security/security-notices.service';
import type { SanctionFollowUpService } from '../modules/sanctions/sanction-follow-up.service';
import { createSanctionsModule } from '../modules/sanctions/sanctions.plugin';
import {
  createUserAdminModule,
  type UserAdminModuleOptions,
} from '../modules/user-admin/user-admin.plugin';

/** What `buildApp` already has for the backoffice: the links module's needs plus the deletion's
 *  (memberships to forget), the landing and the reply-to of the measures' e-mails, and the badges
 *  module (built earlier: the profiles read the badges through its service). */
export type BackofficeWiring = AccountLinksModuleOptions &
  Pick<
    UserAdminModuleOptions,
    | 'memberships'
    | 'juggernauts'
    | 'profiles'
    | 'ownedTables'
    | 'tables'
    | 'mailer'
    | 'sitePublicUrl'
  > &
  Readonly<{
    badges: BadgesModule;
    mailReplyTo: string | null;
    /** The measures record whether their e-mail left (`deliver`). */
    notices: Pick<SecurityNoticesService, 'send' | 'deliver'>;
  }>;

/** Registers the invitation and new-password links, the backoffice over the accounts, the
 *  measures against accounts and the badge catalog under `prefix`; the account list reads the
 *  pending invitations from the links module, and a ban goes through the account deletion.
 *
 *  Example: `await wireBackoffice(app, { ...shared, memberships, mailer }, '/api')` */
export async function wireBackoffice(
  app: FastifyInstance,
  wiring: BackofficeWiring,
  prefix: string,
): Promise<Readonly<{ sanctionFollowUp: SanctionFollowUpService }>> {
  const links = createAccountLinksModule(wiring);
  await app.register(links.plugin, { prefix });
  const { memberships, mailer, db, sessionEnded, notices, cipher, clock, appPublicUrl } = wiring;
  const { sitePublicUrl } = wiring;
  const userAdmin = createUserAdminModule({
    db,
    invitations: links.invitations,
    sessionEnded,
    memberships,
    juggernauts: wiring.juggernauts,
    profiles: wiring.profiles,
    ownedTables: wiring.ownedTables,
    tables: wiring.tables,
    notices,
    cipher,
    clock,
    appPublicUrl,
    mailer,
    sitePublicUrl,
  });
  await app.register(userAdmin.plugin, { prefix });
  const mailing = { notices, cipher, clock, appPublicUrl, sitePublicUrl };
  const sanctions = createSanctionsModule({
    db,
    deletion: userAdmin.service,
    sessionEnded,
    ...mailing,
    replyTo: wiring.mailReplyTo,
    log: app.log,
  });
  await app.register(sanctions.plugin, { prefix });
  await app.register(wiring.badges.plugin, { prefix });
  return { sanctionFollowUp: sanctions.followUp };
}
