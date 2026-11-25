import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { AssetStoragePort } from '../assets/asset-storage.port';
import type { ClockPort } from '../auth/clock.port';
import { UsersDao } from '../auth/users.dao';
import type { AvatarProcessorPort } from '../profiles/avatar-processor.port';
import { CustomEmojiRefsService } from './custom-emoji-refs.service';
import { CustomEmojisDao } from './custom-emojis.dao';
import { customEmojisRoutes } from './custom-emojis.routes';
import { CustomEmojisService, type CustomEmojisTransactionRunner } from './custom-emojis.service';

export type CustomEmojiRefsOptions = Readonly<{ db: Database; clock: ClockPort }>;

/** The refs of a message, shared by the chat, the direct messages and the HTTP module (which
 *  forgets an account's cache when it changes).
 *
 *  Example: `const refs = createCustomEmojiRefs({ db, clock })` */
export function createCustomEmojiRefs(options: CustomEmojiRefsOptions): CustomEmojiRefsService {
  return new CustomEmojiRefsService({
    emojis: new CustomEmojisDao(options.db),
    clock: options.clock,
  });
}

export type CustomEmojisModuleOptions = Readonly<{
  db: Database;
  storage: AssetStoragePort;
  processor: AvatarProcessorPort;
  refs: CustomEmojiRefsService;
}>;

export type CustomEmojisModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  service: CustomEmojisService;
}>;

/** Wires the custom emojis: DAO, service and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `await app.register(createCustomEmojisModule(options).plugin, { prefix: '/api' })` */
export function createCustomEmojisModule(options: CustomEmojisModuleOptions): CustomEmojisModule {
  const { db, storage, processor, refs } = options;
  const transaction: CustomEmojisTransactionRunner = (work) =>
    runInTransaction(db, (tx) => work(new CustomEmojisDao(tx), new UsersDao(tx)));
  const service = new CustomEmojisService({
    emojis: new CustomEmojisDao(db),
    transaction,
    storage,
    processor,
    refs,
    newId: randomUUID,
  });
  return { plugin: customEmojisRoutes(service), service };
}
