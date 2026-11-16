import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import type { AssetStoragePort } from '../assets/asset-storage.port';
import type { ImageFetcherPort } from '../assets/image-fetcher.port';
import { UsersDao } from '../auth/users.dao';
import { FriendshipsDao } from '../friends/friendships.dao';
import type { AccountBadgesPort } from './account-badges.port';
import type { AvatarProcessorPort } from './avatar-processor.port';
import type { ProfileCardPresencePort } from './profile-card-presence.port';
import { registerProfileCardRoute, registerProfileLookupRoute } from './profile-card.routes';
import { ProfileCardDao } from './profile-card.dao';
import { ProfileCardService, type ProfileCardServiceDeps } from './profile-card.service';
import type { ProfileChangedPort } from './profile-changed.port';
import { profileImageEdgesOf } from './profile-images.routes';
import { ProfilesDao } from './profiles.dao';
import { profilesRoutes } from './profiles.routes';
import { ProfilesService } from './profiles.service';

export type ProfilesModuleOptions = Readonly<{
  db: Database;
  /** The same bucket as the assets; photos live under `avatars/`, dice textures under
   *  `dice-textures/`. */
  storage: AssetStoragePort;
  processor: AvatarProcessorPort;
  profileChanged: ProfileChangedPort;
  /** The guarded link fetcher of the assets, capped at the photo's (and texture's) 5 MiB. */
  fetcher: ImageFetcherPort;
  /** The reputation service: the card's summary as the reader sees it. */
  reputation: ProfileCardServiceDeps['reputation'];
  /** The account presence: a friend's card shows online or offline. */
  presence: ProfileCardPresencePort;
  /** The badges module's service: the badges of the card and of the own profile. */
  badges: AccountBadgesPort;
}>;

export type ProfilesModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the profiles module: the DAO over `users`, the service and the HTTP edge (the profile,
 *  the card of another account, then the photo and dice texture routes). Needs
 *  `app.authGuards`.
 *
 *  Example: `await app.register(createProfilesModule(options).plugin, { prefix: '/api' })` */
export function createProfilesModule(options: ProfilesModuleOptions): ProfilesModule {
  const service = new ProfilesService({
    profiles: new ProfilesDao(options.db),
    storage: options.storage,
    processor: options.processor,
    profileChanged: options.profileChanged,
    accounts: new UsersDao(options.db),
    fetcher: options.fetcher,
    badges: options.badges,
    newId: randomUUID,
  });
  const cards = new ProfileCardService({
    cards: new ProfileCardDao(options.db),
    friendships: new FriendshipsDao(options.db),
    reputation: options.reputation,
    presence: options.presence,
    badges: options.badges,
  });
  return {
    plugin: profilesRoutes(service, profileImageEdgesOf(service), (app) => {
      registerProfileCardRoute(app, cards);
      registerProfileLookupRoute(app, cards);
    }),
  };
}
