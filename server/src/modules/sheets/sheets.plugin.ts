import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInSnapshot, runInTransaction, type DatabaseExecutor } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import type { TokensService } from '../tokens/tokens.service';
import { SheetBarsService, type SheetBarsServiceDeps } from './sheet-bars.service';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CampaignsDao } from '../campaigns/campaigns.dao';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import { SceneFoldersDao } from '../library/scene-folders.dao';
import type { SheetPublisherPort } from './sheet-publisher.port';
import { SheetHolderService, type SheetHolderServiceDeps } from './sheet-holder.service';
import { UsersDao } from '../auth/users.dao';
import { MemberCardsDao } from '../member-cards/member-cards.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import { TokensDao } from '../tokens/tokens.dao';
import { SheetTemplatesDao } from './sheet-templates.dao';
import { SheetTemplatesService, type SheetTemplateDaos } from './sheet-templates.service';
import { SheetsDao } from './sheets.dao';
import { sheetsRoutes } from './sheets.routes';
import { SheetsService, type SheetDaos } from './sheets.service';

export type SheetsModuleOptions = Readonly<{
  db: Database;
  clock: ClockPort;
  /** `library:changed` after each template write. */
  libraryPublisher: Pick<LibraryPublisherPort, 'libraryChanged'>;
  /** `sheet:changed` after each sheet write. */
  sheetPublisher: SheetPublisherPort;
  /** `token:created` and `member:cardChanged` of the anchor a player's sheet creates. */
  boardPublisher: SheetHolderServiceDeps['publisher'];
}>;

export type SheetsModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the sheets: templates and sheets, their DAOs, services and HTTP edge. Needs
 *  `app.authGuards`.
 *
 *  Example: `await app.register(createSheetsModule({ db, clock, libraryPublisher, sheetPublisher, boardPublisher }).plugin, { prefix: '/api' })` */
export function createSheetsModule(options: SheetsModuleOptions): SheetsModule {
  const { db, clock, libraryPublisher, sheetPublisher, boardPublisher } = options;
  const templates = new SheetTemplatesService({
    members: new CampaignMembersDao(db),
    read: templateDaos(db),
    transaction: (work) => runInTransaction(db, (tx) => work(templateDaos(tx))),
    clock,
    publisher: libraryPublisher,
  });
  const sheets = new SheetsService({
    read: sheetDaos(db),
    transaction: (work) => runInTransaction(db, (tx) => work(sheetDaos(tx))),
    snapshot: (work) => runInSnapshot(db, (tx) => work(sheetDaos(tx))),
    clock,
    publisher: sheetPublisher,
    library: libraryPublisher,
    holders: new SheetHolderService({ publisher: boardPublisher, clock }),
  });
  return { plugin: sheetsRoutes({ templates, sheets }) };
}

function templateDaos(executor: DatabaseExecutor): SheetTemplateDaos {
  return {
    campaigns: new CampaignsDao(executor),
    folders: new SceneFoldersDao(executor),
    templates: new SheetTemplatesDao(executor),
    uses: new SheetsDao(executor),
  };
}

/** The DAOs of one sheet transaction (or of the pool), all on the same executor. */
export function sheetDaos(executor: DatabaseExecutor): SheetDaos {
  return {
    campaigns: new CampaignsDao(executor),
    members: new CampaignMembersDao(executor),
    sheets: new SheetsDao(executor),
    templates: new SheetTemplatesDao(executor),
    folders: new SceneFoldersDao(executor),
    scenes: new ScenesDao(executor),
    tokens: new TokensDao(executor),
    memberCards: new MemberCardsDao(executor),
    users: new UsersDao(executor),
  };
}

/** The `sheet:adjustBar` use case, on the tokens service of the board (built by the realtime
 *  wiring, which binds the command in the table's queue).
 *
 *  Example: `createSheetBarsService({ db, members, tokens })` */
export function createSheetBarsService(
  options: Readonly<{
    db: Database;
    members: SheetBarsServiceDeps['members'];
    tokens: Pick<TokensService, 'adjustHolderBar'>;
  }>,
): SheetBarsService {
  const { db, members, tokens } = options;
  return new SheetBarsService({ members, sheets: new SheetsDao(db), tokens });
}
