import { savedTokenFolderNameKey, type SavedTokenFolderDto } from '@lorkarium/contracts';
import { isUniqueViolation } from '../../lib/postgres-error';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import { SavedTokenRulesBo, type SavedTokenMaximums } from './saved-token.bo';
import type { SavedTokenFoldersDao } from './saved-token-folders.dao';
import type { SavedTokenOwner } from './saved-tokens.dao';
import {
  SavedTokenFolderNameTakenError,
  SavedTokenFolderNotFoundError,
} from './saved-tokens.error';
import { lockedLimitsOf, type SavedTokensTransactionRunner } from './saved-tokens.service';
import type { SavedTokenFolderPo } from './saved-tokens.po';

const NAME_UNIQUE_INDEX = 'saved_token_folders_member_name_unique';

export type SavedTokenFoldersServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  folders: Pick<SavedTokenFoldersDao, 'listOf' | 'rename' | 'remove'>;
  transaction: SavedTokensTransactionRunner;
  maximums: SavedTokenMaximums;
}>;

/** The folders of saved tokens of the session's user at one table, under the saved tokens' rules:
 *  only the owner sees them, and deleting one keeps its tokens out of any folder.
 *
 *  Example: `await service.create({ campaignId, userId }, 'Mortos-vivos')` */
export class SavedTokenFoldersService {
  private readonly rules: SavedTokenRulesBo;

  constructor(private readonly deps: SavedTokenFoldersServiceDeps) {
    this.rules = new SavedTokenRulesBo(deps.maximums);
  }

  async list(owner: SavedTokenOwner): Promise<SavedTokenFolderDto[]> {
    await this.requireMember(owner);
    return (await this.deps.folders.listOf(owner)).map(toSavedTokenFolderDto);
  }

  /** Counts and inserts under the member's lock (Grátis keeps no folder). */
  async create(owner: SavedTokenOwner, name: string): Promise<SavedTokenFolderDto> {
    await this.requireMember(owner);
    const row = await namedWrite(name, () =>
      this.deps.transaction(async ({ plans, folders }) => {
        const limits = await lockedLimitsOf(plans, owner);
        this.rules.requireFolderRoom(await folders.countOf(owner), limits);
        return folders.insert({ ...owner, ...namedOf(name) });
      }),
    );
    return toSavedTokenFolderDto(row);
  }

  async rename(
    owner: SavedTokenOwner,
    folderId: string,
    name: string,
  ): Promise<SavedTokenFolderDto> {
    await this.requireMember(owner);
    const row = await namedWrite(name, () =>
      this.deps.folders.rename(owner, folderId, namedOf(name)),
    );
    if (!row) throw new SavedTokenFolderNotFoundError(owner.campaignId, owner.userId, folderId);
    return toSavedTokenFolderDto(row);
  }

  async remove(owner: SavedTokenOwner, folderId: string): Promise<void> {
    await this.requireMember(owner);
    if (await this.deps.folders.remove(owner, folderId)) return;
    throw new SavedTokenFolderNotFoundError(owner.campaignId, owner.userId, folderId);
  }

  private async requireMember(owner: SavedTokenOwner): Promise<void> {
    await memberAccessOf(this.deps.members, owner.campaignId, owner.userId);
  }
}

function namedOf(name: string): Pick<SavedTokenFolderPo, 'name' | 'nameKey'> {
  return { name, nameKey: savedTokenFolderNameKey(name) };
}

function toSavedTokenFolderDto(row: SavedTokenFolderPo): SavedTokenFolderDto {
  return { id: row.id, name: row.name };
}

// The unique index is the referee of a repeated name (two saves at once included).
async function namedWrite<T>(name: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (!isUniqueViolation(error, NAME_UNIQUE_INDEX)) throw error;
    throw new SavedTokenFolderNameTakenError(name);
  }
}
