import type { Database } from '../database/database';
import { CryptoCampaignCode } from '../infrastructure/campaign-code/crypto-campaign-code';
import { SystemClock } from '../infrastructure/clock/system-clock';
import { Argon2PasswordHasher } from '../infrastructure/password-hasher/argon2-password-hasher';
import { UsersDao } from '../modules/auth/users.dao';
import { CampaignJoinService } from '../modules/campaigns/campaign-join.service';
import { CampaignMembersDao } from '../modules/campaigns/campaign-members.dao';
import {
  createCampaignsModule,
  memberRoleTransactionOver,
} from '../modules/campaigns/campaigns.plugin';
import type { CharacterPublisherPort } from '../modules/characters/character-publisher.port';
import { createCharactersModule } from '../modules/characters/characters.plugin';
import type { PresenceReaderPort } from '../modules/campaigns/presence-reader.port';
import { CampaignsDao } from '../modules/campaigns/campaigns.dao';
import type { MemberRoleChangedPort } from '../modules/campaigns/member-role-changed.port';
import { MemberRoleService } from '../modules/campaigns/member-role.service';
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
const SILENT_CHARACTERS: CharacterPublisherPort = { charactersChanged: () => undefined };
const NO_AUDIENCE = new Proxy({} as SceneAudiencePort, { get: () => async () => undefined });
const NOBODY_ONLINE: PresenceReaderPort = { onlineUserIdsOf: () => new Set() };
const NO_LIVE_TABLE: MemberRoleChangedPort = { memberRoleChanged: async () => undefined };

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
  const campaignsModule = createCampaignsModule({
    db,
    hasher,
    codes: new CryptoCampaignCode(),
    clock,
    presence: NOBODY_ONLINE,
  });
  const { memberships } = campaignsModule;
  const characters = createCharactersModule({ db, members, publisher: SILENT_CHARACTERS, clock });
  const transaction = memberRoleTransactionOver(db, characters.seatIn);
  return createDevSeedModule({
    users: new UsersDao(db),
    campaigns: campaignsModule.service,
    join: new CampaignJoinService({ campaigns, members, hasher, clock }),
    roles: new MemberRoleService({
      ...{ campaigns, members, memberships, transaction },
      ...{ changed: NO_LIVE_TABLE, presence: NOBODY_ONLINE },
    }),
    scenes: createScenesModule({
      ...board,
      audience: NO_AUDIENCE,
      libraryPublisher: SILENT_LIBRARY,
    }).service,
    walls: createWallsModule(board).service,
    lights: createLightsModule(board).service,
    tokens: createTokensModule({ ...board, characterPublisher: SILENT_CHARACTERS }).batch,
  }).stressScene;
}
