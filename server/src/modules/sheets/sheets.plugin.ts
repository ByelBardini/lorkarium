import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInSnapshot, runInTransaction, type DatabaseExecutor } from '../../database/transaction';
import { AssetsDao } from '../assets/assets.dao';
import type { ClockPort } from '../auth/clock.port';
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import { CharactersDao } from '../characters/characters.dao';
import { ConditionsDao } from '../conditions/conditions.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import { TokenHangingDao } from '../tokens/token-hanging.dao';
import { TokensDao } from '../tokens/tokens.dao';
import { SheetBarsService, type SheetBarsServiceDeps } from './sheet-bars.service';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CampaignsDao } from '../campaigns/campaigns.dao';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import { SceneFoldersDao } from '../library/scene-folders.dao';
import type { SheetPublisherPort } from './sheet-publisher.port';
import { SheetHolderService } from './sheet-holder.service';
import { SheetTemplatesDao } from './sheet-templates.dao';
import { SheetTemplatesService, type SheetTemplateDaos } from './sheet-templates.service';
import { SheetsDao } from './sheets.dao';
import { sheetsRoutes } from './sheets.routes';
import { SheetsService, type SheetDaos, type SheetsServiceDeps } from './sheets.service';

export type SheetsModuleOptions = Readonly<{
  db: Database;
  clock: ClockPort;
  /** `library:changed` after each template write. */
  libraryPublisher: Pick<LibraryPublisherPort, 'libraryChanged'>;
  /** `sheet:changed` after each sheet write. */
  sheetPublisher: SheetPublisherPort;
  /** `character:changed` when a character's main sheet or bars change. */
  characterPublisher: CharacterPublisherPort;
  /** `token:updated` when giving a sheet adds bars to a loose token. */
  boardPublisher: SheetsServiceDeps['board'];
}>;

export type SheetsModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the sheets: templates and sheets, their DAOs, services and HTTP edge. Needs
 *  `app.authGuards`.
 *
 *  Example: `await app.register(createSheetsModule({ db, clock, libraryPublisher, sheetPublisher, characterPublisher, boardPublisher }).plugin, { prefix: '/api' })` */
export function createSheetsModule(options: SheetsModuleOptions): SheetsModule {
  const { db, clock, libraryPublisher, sheetPublisher, characterPublisher } = options;
  const board = options.boardPublisher;
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
    characterPublisher,
    board,
    holders: new SheetHolderService(),
  });
  return { plugin: sheetsRoutes({ templates, sheets }) };
}

function templateDaos(executor: DatabaseExecutor): SheetTemplateDaos {
  return {
    campaigns: new CampaignsDao(executor),
    folders: new SceneFoldersDao(executor),
    templates: new SheetTemplatesDao(executor),
    uses: new SheetsDao(executor),
    assets: new AssetsDao(executor),
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
    characters: new CharactersDao(executor),
    scenes: new ScenesDao(executor),
    tokens: new TokensDao(executor),
    tokenBars: new TokenHangingDao(executor),
    conditions: new ConditionsDao(executor),
  };
}

/** The `sheet:adjustBar` and `sheet:spendBars` use cases, on the tokens and the characters services of the board (built
 *  by the realtime wiring, which binds the command in the table's queue).
 *
 *  Example: `createSheetBarsService({ db, members, tokens, characters })` */
export function createSheetBarsService(
  options: Readonly<{
    db: Database;
    members: SheetBarsServiceDeps['members'];
    tokens: SheetBarsServiceDeps['tokens'];
    characters: SheetBarsServiceDeps['characters'];
  }>,
): SheetBarsService {
  const { db, members, tokens, characters } = options;
  const holders = new SheetHolderService();
  return new SheetBarsService({ members, sheets: new SheetsDao(db), holders, tokens, characters });
}
