import type {
  CreateSavedRollRequestDto,
  SavedRollDto,
  SavedRollsResponseDto,
  UpdateSavedRollRequestDto,
} from '@lorkarium/contracts';
import { isUniqueViolation } from '../../lib/postgres-error';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { memberAccessOf } from '../campaigns/member-access';
import { memberSavedRollLimitsOf, type MemberSavedRollLimits } from '../plans/plan-limits.bo';
import { SavedRollRulesBo } from './saved-roll.bo';
import type { SavedRollFoldersDao } from './saved-roll-folders.dao';
import type { SavedRollsDao } from './saved-rolls.dao';
import type { SavedRollPo } from './saved-rolls.po';
import {
  SavedRollFolderNotFoundError,
  SavedRollNameTakenError,
  SavedRollNotFoundError,
} from './saved-rolls.error';
import {
  toNewSavedRollPo,
  toSavedRollChangesPo,
  toSavedRollDto,
  type SavedRollOwner,
} from './saved-rolls.mapper';

const NAME_UNIQUE_INDEX = 'saved_rolls_member_name_unique';

export type SavedRollWriteDaos = Readonly<{
  rolls: Pick<SavedRollsDao, 'lockPlans' | 'countOf' | 'insert' | 'rankOf' | 'update'>;
  folders: Pick<SavedRollFoldersDao, 'findOf' | 'countOf' | 'insert'>;
}>;

export type SavedRollsTransactionRunner = <T>(
  work: (daos: SavedRollWriteDaos) => Promise<T>,
) => Promise<T>;

export type SavedRollsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  /** `findPlans`: the two plans of the ceiling, read without a lock for the list's `planLocked`. */
  rolls: Pick<SavedRollsDao, 'listOf' | 'remove' | 'findPlans'>;
  transaction: SavedRollsTransactionRunner;
  /** `SAVED_ROLLS_MAX`, passed in: the BO does not read the contract. */
  maxSaved: number;
}>;

/** The saved rolls of the session's user at one table: only the owner lists, creates, edits and
 *  deletes them. The spectator watches and does not roll, so every call asks for a member who
 *  acts at the table (FORBIDDEN before any read of the rolls).
 *
 *  Example: `await service.create({ campaignId, userId }, { name: 'Acerto', parts })` */
export class SavedRollsService {
  private readonly rules: SavedRollRulesBo;

  constructor(private readonly deps: SavedRollsServiceDeps) {
    this.rules = new SavedRollRulesBo(deps.maxSaved);
  }

  async list(owner: SavedRollOwner): Promise<SavedRollsResponseDto> {
    await this.requireMember(owner);
    const plans = await this.deps.rolls.findPlans(owner.campaignId, owner.userId);
    if (!plans) throw notMember(owner);
    const limits = memberSavedRollLimitsOf(plans);
    const rows = await this.deps.rolls.listOf(owner.campaignId, owner.userId);
    // `listOf` is in creation order: the index is the rank.
    const savedRolls = rows.map((row, rank) => this.dtoOf(row, rank, limits));
    return { savedRolls };
  }

  /** Counts and inserts under the owner's lock, so two saves never pass the ceiling together; the
   *  ceiling is the greater of the table owner's plan and the member's, read in that lock. */
  async create(owner: SavedRollOwner, input: CreateSavedRollRequestDto): Promise<SavedRollDto> {
    await this.requireMember(owner);
    this.rules.requireReadable(input.parts.map((part) => part.expression));
    return this.namedWrite(input.name, () =>
      this.deps.transaction(async ({ rolls, folders }) => {
        const limits = await lockedLimitsOf(rolls, owner);
        const kept = await rolls.countOf(owner.campaignId, owner.userId);
        this.rules.requireRoomFor(kept, limits);
        await requireOwnFolder(folders, owner, input.folderId);
        const row = await rolls.insert(toNewSavedRollPo(owner, input));
        return this.dtoOf(row, kept, limits);
      }),
    );
  }

  async update(
    owner: SavedRollOwner,
    savedRollId: string,
    changes: UpdateSavedRollRequestDto,
  ): Promise<SavedRollDto> {
    await this.requireMember(owner);
    if (changes.parts) this.rules.requireReadable(changes.parts.map((part) => part.expression));
    const { campaignId, userId } = owner;
    return this.namedWrite(changes.name, () =>
      this.deps.transaction(async ({ rolls, folders }) => {
        const limits = await lockedLimitsOf(rolls, owner);
        const rank = await rolls.rankOf(campaignId, userId, savedRollId);
        if (rank === undefined) throw new SavedRollNotFoundError(campaignId, userId, savedRollId);
        if (changes.name !== undefined || changes.parts)
          this.rules.requireConfigurable(rank, limits);
        await requireOwnFolder(folders, owner, changes.folderId);
        const row = await rolls.update(
          campaignId,
          userId,
          savedRollId,
          toSavedRollChangesPo(changes),
        );
        if (!row) throw new SavedRollNotFoundError(campaignId, userId, savedRollId);
        return this.dtoOf(row, rank, limits);
      }),
    );
  }

  async remove(owner: SavedRollOwner, savedRollId: string): Promise<void> {
    await this.requireMember(owner);
    const { campaignId, userId } = owner;
    if (await this.deps.rolls.remove(campaignId, userId, savedRollId)) return;
    throw new SavedRollNotFoundError(campaignId, userId, savedRollId);
  }

  private dtoOf(row: SavedRollPo, rank: number, limits: MemberSavedRollLimits): SavedRollDto {
    return toSavedRollDto(row, this.rules.isPlanLocked(rank, limits));
  }

  private async requireMember(owner: SavedRollOwner): Promise<void> {
    await memberAccessOf(this.deps.members, owner.campaignId, owner.userId);
  }

  // The unique index is the referee of a repeated name (two saves at once included).
  private async namedWrite<T>(name: string | undefined, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (name === undefined || !isUniqueViolation(error, NAME_UNIQUE_INDEX)) throw error;
      throw new SavedRollNameTakenError(name);
    }
  }
}

// The foreign key only says the folder exists; whose it is, the owner's query says.
async function requireOwnFolder(
  folders: Pick<SavedRollFoldersDao, 'findOf'>,
  owner: SavedRollOwner,
  folderId: string | null | undefined,
): Promise<void> {
  if (folderId === undefined || folderId === null) return;
  const { campaignId, userId } = owner;
  if (await folders.findOf(campaignId, userId, folderId)) return;
  throw new SavedRollFolderNotFoundError(campaignId, userId, folderId);
}

// The membership's lock, so two writes of the same member go one after the other, and the two
// plans of the ceiling read in it.
async function lockedLimitsOf(
  rolls: Pick<SavedRollsDao, 'lockPlans'>,
  owner: SavedRollOwner,
): Promise<MemberSavedRollLimits> {
  const plans = await rolls.lockPlans(owner.campaignId, owner.userId);
  if (!plans) throw notMember(owner);
  return memberSavedRollLimitsOf(plans);
}

function notMember(owner: SavedRollOwner): CampaignNotFoundError {
  return new CampaignNotFoundError(owner);
}
