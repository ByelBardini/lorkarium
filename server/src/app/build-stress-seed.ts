import type { Database } from '../database/database';
import { CryptoCampaignCode } from '../infrastructure/campaign-code/crypto-campaign-code';
import { SystemClock } from '../infrastructure/clock/system-clock';
import { Argon2PasswordHasher } from '../infrastructure/password-hasher/argon2-password-hasher';
import { UsersDao } from '../modules/auth/users.dao';
import { CampaignJoinService } from '../modules/campaigns/campaign-join.service';
import { CampaignMembersDao } from '../modules/campaigns/campaign-members.dao';
import { createCampaignsModule } from '../modules/campaigns/campaigns.plugin';
import { CampaignsDao } from '../modules/campaigns/campaigns.dao';
import { createLightsModule } from '../modules/lights/lights.plugin';
import type { LibraryPublisherPort } from '../modules/library/library-publisher.port';
import type { BoardPublisherPort } from '../modules/scenes/board-publisher.port';
import type { SceneAudiencePort } from '../modules/scenes/scene-audience.port';
import { createScenesModule } from '../modules/scenes/scenes.plugin';
import { createTokensModule } from '../modules/tokens/tokens.plugin';
import { SceneWallsService } from '../modules/walls/scene-walls.service';
import { createWallsModule } from '../modules/walls/walls.plugin';
import { createDevSeedModule } from '../modules/dev-seed/dev-seed.plugin';
import type { StressSceneSeedService } from '../modules/dev-seed/stress-scene-seed.service';

// The seed runs with no table open: every board event it causes goes nowhere.
const SILENT_PUBLISHER = new Proxy({} as BoardPublisherPort, { get: () => () => undefined });
const SILENT_LIBRARY = new Proxy({} as LibraryPublisherPort, { get: () => () => undefined });
const NO_AUDIENCE = new Proxy({} as SceneAudiencePort, { get: () => async () => undefined });

/** Wires the stress seed over the real services (`pnpm db:seed-stress` and its integration spec).
 *
 *  Example: `await buildStressSceneSeed(database.db).seed(env.nodeEnv)` */
export function buildStressSceneSeed(db: Database): StressSceneSeedService {
  const clock = new SystemClock();
  const hasher = new Argon2PasswordHasher();
  const members = new CampaignMembersDao(db);
  const board = {
    db,
    publisher: SILENT_PUBLISHER,
    clock,
    members,
    sceneWalls: new SceneWallsService(),
  };
  const campaigns = new CampaignsDao(db);
  return createDevSeedModule({
    users: new UsersDao(db),
    campaigns: createCampaignsModule({ db, hasher, codes: new CryptoCampaignCode(), clock })
      .service,
    join: new CampaignJoinService({ campaigns, members, hasher, clock }),
    scenes: createScenesModule({
      ...board,
      audience: NO_AUDIENCE,
      libraryPublisher: SILENT_LIBRARY,
    }).service,
    walls: createWallsModule(board).service,
    lights: createLightsModule(board).service,
    tokens: createTokensModule(board).batch,
  }).stressScene;
}
