import type { AppDependencies } from '@/app/router';
import { createOpenTablesStore } from '@/stores/open-tables-store';
import { createRailStore } from '@/stores/rail-store';
import { createSessionStore } from '@/stores/session-store';
import { AuthApiFake } from './auth-api-fake';
import { CallJournal } from './call-journal';
import { CampaignsApiFake } from './campaigns-api-fake';
import { ClipboardFake } from './clipboard-fake';
import { StorageFake } from './storage-fake';
import { TableSessionApiFake } from './table-session-api-fake';

export type TestDependencies = AppDependencies & {
  authApi: AuthApiFake;
  campaignsApi: CampaignsApiFake;
  clipboard: ClipboardFake;
  /** The session api under `openTables`, for specs to play the server. */
  tableSessionApi: TableSessionApiFake;
  /** The `sessionStorage` under `openTables`. */
  tabStorage: StorageFake;
  /** Where the auth and table session fakes write, in call order. */
  journal: CallJournal;
};

// Wednesday, 14 October 2026, local time: the date the overline is written against.
export const TEST_NOW = new Date(2026, 9, 14, 20, 0);

/** Every dependency of the router as a fake, with a fixed clock and the first greeting drawn.
 *
 *  Example: `const deps = testDependencies(); createMemoryRouter(buildRoutes(deps), …)` */
export function testDependencies(): TestDependencies {
  const journal = new CallJournal();
  const tableSessionApi = new TableSessionApiFake(journal);
  const tabStorage = new StorageFake();
  return {
    journal,
    authApi: new AuthApiFake(journal),
    campaignsApi: new CampaignsApiFake(),
    clipboard: new ClipboardFake(),
    tableSessionApi,
    tabStorage,
    openTables: createOpenTablesStore({ api: tableSessionApi, storage: tabStorage }),
    sessionStore: createSessionStore(),
    railStore: createRailStore(new StorageFake()),
    now: () => TEST_NOW,
    random: () => 0,
  };
}
