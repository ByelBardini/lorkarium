import type { AppDependencies } from '@/app/router';
import { createRailStore } from '@/stores/rail-store';
import { createSessionStore } from '@/stores/session-store';
import { AuthApiFake } from './auth-api-fake';
import { CampaignsApiFake } from './campaigns-api-fake';
import { ClipboardFake } from './clipboard-fake';
import { StorageFake } from './storage-fake';

export type TestDependencies = AppDependencies & {
  authApi: AuthApiFake;
  campaignsApi: CampaignsApiFake;
  clipboard: ClipboardFake;
};

// Wednesday, 14 October 2026, local time: the date the overline is written against.
export const TEST_NOW = new Date(2026, 9, 14, 20, 0);

/** Every dependency of the router as a fake, with a fixed clock and the first greeting drawn.
 *
 *  Example: `const deps = testDependencies(); createMemoryRouter(buildRoutes(deps), …)` */
export function testDependencies(): TestDependencies {
  return {
    authApi: new AuthApiFake(),
    campaignsApi: new CampaignsApiFake(),
    clipboard: new ClipboardFake(),
    sessionStore: createSessionStore(),
    railStore: createRailStore(new StorageFake()),
    now: () => TEST_NOW,
    random: () => 0,
  };
}
