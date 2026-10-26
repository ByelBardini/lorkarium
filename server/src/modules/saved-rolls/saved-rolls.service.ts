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
import { SavedRollRulesBo } from './saved-roll.bo';
import type { SavedRollsDao } from './saved-rolls.dao';
import { SavedRollNameTakenError, SavedRollNotFoundError } from './saved-rolls.error';
import {
  toNewSavedRollPo,
  toSavedRollChangesPo,
  toSavedRollDto,
  type SavedRollOwner,
} from './saved-rolls.mapper';

const NAME_UNIQUE_INDEX = 'saved_rolls_member_name_unique';

export type SavedRollWriteDaos = Readonly<{
  rolls: Pick<SavedRollsDao, 'lockOwner' | 'countOf' | 'insert'>;
}>;

export type SavedRollsTransactionRunner = <T>(
  work: (daos: SavedRollWriteDaos) => Promise<T>,
) => Promise<T>;

export type SavedRollsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  rolls: Pick<SavedRollsDao, 'listOf' | 'update' | 'remove'>;
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
    const rows = await this.deps.rolls.listOf(owner.campaignId, owner.userId);
    return { savedRolls: rows.map(toSavedRollDto) };
  }

  /** Counts and inserts under the owner's lock, so two saves never pass the ceiling together. */
  async create(owner: SavedRollOwner, input: CreateSavedRollRequestDto): Promise<SavedRollDto> {
    await this.requireMember(owner);
    this.rules.requireReadable(input.parts.map((part) => part.expression));
    const row = await this.namedWrite(input.name, () =>
      this.deps.transaction(async ({ rolls }) => {
        if (!(await rolls.lockOwner(owner.campaignId, owner.userId))) throw notMember(owner);
        this.rules.requireRoomFor(await rolls.countOf(owner.campaignId, owner.userId));
        return rolls.insert(toNewSavedRollPo(owner, input));
      }),
    );
    return toSavedRollDto(row);
  }

  async update(
    owner: SavedRollOwner,
    savedRollId: string,
    changes: UpdateSavedRollRequestDto,
  ): Promise<SavedRollDto> {
    await this.requireMember(owner);
    if (changes.parts) this.rules.requireReadable(changes.parts.map((part) => part.expression));
    const { campaignId, userId } = owner;
    const write = () =>
      this.deps.rolls.update(campaignId, userId, savedRollId, toSavedRollChangesPo(changes));
    const row = await this.namedWrite(changes.name, write);
    if (!row) throw new SavedRollNotFoundError(campaignId, userId, savedRollId);
    return toSavedRollDto(row);
  }

  async remove(owner: SavedRollOwner, savedRollId: string): Promise<void> {
    await this.requireMember(owner);
    const { campaignId, userId } = owner;
    if (await this.deps.rolls.remove(campaignId, userId, savedRollId)) return;
    throw new SavedRollNotFoundError(campaignId, userId, savedRollId);
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

function notMember(owner: SavedRollOwner): CampaignNotFoundError {
  return new CampaignNotFoundError(owner);
}
