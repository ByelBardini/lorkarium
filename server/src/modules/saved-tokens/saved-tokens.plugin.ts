import { SAVED_TOKEN_FOLDERS_MAX, SAVED_TOKENS_MAX } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import { AssetsDao } from '../assets/assets.dao';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { MemberPlansDao } from '../plans/member-plans.dao';
import { SavedTokenFoldersDao } from './saved-token-folders.dao';
import { SavedTokenFoldersService } from './saved-token-folders.service';
import { SavedTokensDao } from './saved-tokens.dao';
import { savedTokensRoutes } from './saved-tokens.routes';
import { SavedTokensService, type SavedTokensTransactionRunner } from './saved-tokens.service';

export type SavedTokensModuleOptions = Readonly<{ db: Database }>;

export type SavedTokensModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the saved tokens: DAOs, the services and the HTTP edge. Needs `app.authGuards`.
 *
 *  Example: `const savedTokens = createSavedTokensModule({ db }); await app.register(savedTokens.plugin, { prefix: '/api' })` */
export function createSavedTokensModule(options: SavedTokensModuleOptions): SavedTokensModule {
  const { db } = options;
  const transaction: SavedTokensTransactionRunner = (work) =>
    runInTransaction(db, (tx) =>
      work({
        plans: new MemberPlansDao(tx),
        tokens: new SavedTokensDao(tx),
        folders: new SavedTokenFoldersDao(tx),
      }),
    );
  const members = new CampaignMembersDao(db);
  const maximums = { tokens: SAVED_TOKENS_MAX, folders: SAVED_TOKEN_FOLDERS_MAX };
  const service = new SavedTokensService({
    members,
    plans: new MemberPlansDao(db),
    tokens: new SavedTokensDao(db),
    assets: new AssetsDao(db),
    transaction,
    maximums,
  });
  const folderService = new SavedTokenFoldersService({
    members,
    folders: new SavedTokenFoldersDao(db),
    transaction,
    maximums,
  });
  return { plugin: savedTokensRoutes(service, folderService) };
}
