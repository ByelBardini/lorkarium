import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import type { AssetStoragePort } from '../assets/asset-storage.port';
import type { ImageFetcherPort } from '../assets/image-fetcher.port';
import type { AvatarProcessorPort } from './avatar-processor.port';
import type { ProfileChangedPort } from './profile-changed.port';
import { ProfilesDao } from './profiles.dao';
import { profilesRoutes } from './profiles.routes';
import { ProfilesService } from './profiles.service';

export type ProfilesModuleOptions = Readonly<{
  db: Database;
  /** The same bucket as the assets; photos live under `avatars/`. */
  storage: AssetStoragePort;
  processor: AvatarProcessorPort;
  profileChanged: ProfileChangedPort;
  /** The guarded link fetcher of the assets, capped at the photo's 5 MiB. */
  fetcher: ImageFetcherPort;
}>;

export type ProfilesModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the profiles module: the DAO over `users`, the service and the HTTP edge. Needs
 *  `app.authGuards`.
 *
 *  Example: `await app.register(createProfilesModule(options).plugin, { prefix: '/api' })` */
export function createProfilesModule(options: ProfilesModuleOptions): ProfilesModule {
  const service = new ProfilesService({
    profiles: new ProfilesDao(options.db),
    storage: options.storage,
    processor: options.processor,
    profileChanged: options.profileChanged,
    fetcher: options.fetcher,
    newId: randomUUID,
  });
  return { plugin: profilesRoutes(service) };
}
