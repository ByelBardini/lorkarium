import type { SavedRollFolderDto } from '@lorkarium/contracts';
import { isUniqueViolation } from '../../lib/postgres-error';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { memberAccessOf } from '../campaigns/member-access';
import { requireFolderRoom } from './saved-roll.bo';
import type { SavedRollFoldersDao } from './saved-roll-folders.dao';
import { SavedRollFolderNameTakenError, SavedRollFolderNotFoundError } from './saved-rolls.error';
import {
  namedOf,
  toNewSavedRollFolderPo,
  toSavedRollFolderDto,
  type SavedRollOwner,
} from './saved-rolls.mapper';
import type { SavedRollsTransactionRunner } from './saved-rolls.service';

const NAME_UNIQUE_INDEX = 'saved_roll_folders_member_name_unique';

export type SavedRollFoldersServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  folders: Pick<SavedRollFoldersDao, 'listOf' | 'rename' | 'remove'>;
  transaction: SavedRollsTransactionRunner;
  /** `SAVED_ROLL_FOLDERS_MAX`, passed in: the BO does not read the contract. */
  maxFolders: number;
}>;

/** The folders of the session's user at one table, under the saved rolls' rules: only the owner
 *  sees them, and the spectator gets FORBIDDEN before any read. Deleting one keeps its rolls.
 *
 *  Example: `await service.create({ campaignId, userId }, 'Magias')` */
export class SavedRollFoldersService {
  constructor(private readonly deps: SavedRollFoldersServiceDeps) {}

  async list(owner: SavedRollOwner): Promise<SavedRollFolderDto[]> {
    await this.requireMember(owner);
    const rows = await this.deps.folders.listOf(owner.campaignId, owner.userId);
    return rows.map(toSavedRollFolderDto);
  }

  /** Counts and inserts under the owner's lock, so two saves never pass the ceiling together. */
  async create(owner: SavedRollOwner, name: string): Promise<SavedRollFolderDto> {
    await this.requireMember(owner);
    const { campaignId, userId } = owner;
    const row = await namedWrite(name, () =>
      this.deps.transaction(async ({ rolls, folders }) => {
        if (!(await rolls.lockOwner(campaignId, userId))) throw new CampaignNotFoundError(owner);
        requireFolderRoom(await folders.countOf(campaignId, userId), this.deps.maxFolders);
        return folders.insert(toNewSavedRollFolderPo(owner, name));
      }),
    );
    return toSavedRollFolderDto(row);
  }

  async rename(owner: SavedRollOwner, folderId: string, name: string): Promise<SavedRollFolderDto> {
    await this.requireMember(owner);
    const { campaignId, userId } = owner;
    const row = await namedWrite(name, () =>
      this.deps.folders.rename(campaignId, userId, folderId, namedOf(name)),
    );
    if (!row) throw new SavedRollFolderNotFoundError(campaignId, userId, folderId);
    return toSavedRollFolderDto(row);
  }

  async remove(owner: SavedRollOwner, folderId: string): Promise<void> {
    await this.requireMember(owner);
    const { campaignId, userId } = owner;
    if (await this.deps.folders.remove(campaignId, userId, folderId)) return;
    throw new SavedRollFolderNotFoundError(campaignId, userId, folderId);
  }

  private async requireMember(owner: SavedRollOwner): Promise<void> {
    await memberAccessOf(this.deps.members, owner.campaignId, owner.userId);
  }
}

// The unique index is the referee of a repeated name (two saves at once included).
async function namedWrite<T>(name: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (!isUniqueViolation(error, NAME_UNIQUE_INDEX)) throw error;
    throw new SavedRollFolderNameTakenError(name);
  }
}
