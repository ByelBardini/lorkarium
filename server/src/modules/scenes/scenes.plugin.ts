import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { ClockPort } from '../auth/clock.port';
import { AssetsDao } from '../assets/assets.dao';
import type { MembershipReader } from '../campaigns/cached-memberships';
import { CampaignsDao } from '../campaigns/campaigns.dao';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import type { BoardPublisherPort } from './board-publisher.port';
import type { SceneTransaction } from './locked-scene';
import { SceneActivationService, type SceneActivationDaos } from './scene-activation.service';
import type { SceneAudiencePort } from './scene-audience.port';
import { SceneWatchService, type SceneShareDaos } from './scene-watch.service';
import { ScenesDao } from './scenes.dao';
import { ScenesService, type SceneTransactionRunner } from './scenes.service';

export type ScenesModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** Moves the sockets of a table when its group grid changes. */
  audience: SceneAudiencePort;
  /** Tells the table `scene:activated` and `library:changed`. */
  libraryPublisher: LibraryPublisherPort;
}>;

export type ScenesModule = Readonly<{
  service: ScenesService;
  watch: SceneWatchService;
  activation: SceneActivationService;
}>;

/** Wires the scenes module; its edges are the board gateway (configure, watch, activate) and the
 *  sessions gateway (the group grid a join enters).
 *
 *  Example: `const scenes = createScenesModule({ db, members, publisher, clock, audience, libraryPublisher })` */
export function createScenesModule(options: ScenesModuleOptions): ScenesModule {
  const transaction: SceneTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({ scenes: new ScenesDao(tx), assets: new AssetsDao(tx) }),
    );
  const { members } = options;
  const { publisher, clock } = options;
  const share: SceneTransaction<SceneShareDaos> = (work) =>
    runInTransaction(options.db, (tx) => work({ scenes: new ScenesDao(tx) }));
  const scenes = new ScenesDao(options.db);
  return {
    service: new ScenesService({ members, transaction, publisher, clock }),
    watch: new SceneWatchService({ members, share, scenes }),
    activation: activationOf(options),
  };
}

function activationOf(options: ScenesModuleOptions): SceneActivationService {
  const { db, members, audience, libraryPublisher: publisher, clock } = options;
  const transaction: SceneTransaction<SceneActivationDaos> = (work) =>
    runInTransaction(db, (tx) =>
      work({ campaigns: new CampaignsDao(tx), scenes: new ScenesDao(tx) }),
    );
  return new SceneActivationService({ members, transaction, audience, publisher, clock });
}
