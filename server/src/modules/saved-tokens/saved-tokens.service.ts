import type {
  CreateSavedTokenRequestDto,
  SavedTokenDto,
  SavedTokensResponseDto,
  UpdateSavedTokenRequestDto,
} from '@lorkarium/contracts';
import type { AssetsDao } from '../assets/assets.dao';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { memberAccessOf } from '../campaigns/member-access';
import type { MemberPlansDao } from '../plans/member-plans.dao';
import { memberSavedTokenLimitsOf, type MemberSavedRollLimits } from '../plans/plan-limits.bo';
import { requireAssetsOf } from '../tokens/token-transaction';
import { SavedTokenRulesBo, type SavedTokenMaximums } from './saved-token.bo';
import type { SavedTokenFoldersDao } from './saved-token-folders.dao';
import type { SavedTokenOwner, SavedTokensDao } from './saved-tokens.dao';
import { SavedTokenFolderNotFoundError, SavedTokenNotFoundError } from './saved-tokens.error';
import {
  assetIdsOf,
  toNewSavedTokenRows,
  toSavedTokenDto,
  toSavedTokenWrite,
} from './saved-tokens.mapper';
import type { SavedTokenRow } from './saved-tokens.po';

export type SavedTokenWriteDaos = Readonly<{
  plans: Pick<MemberPlansDao, 'lock'>;
  tokens: Pick<SavedTokensDao, 'countOf' | 'insert' | 'rankOf' | 'update'>;
  folders: Pick<SavedTokenFoldersDao, 'findOf' | 'countOf' | 'insert'>;
}>;

export type SavedTokensTransactionRunner = <T>(
  work: (daos: SavedTokenWriteDaos) => Promise<T>,
) => Promise<T>;

export type SavedTokensServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  /** The two plans of the ceiling, read without a lock for the list's `planLocked`. */
  plans: Pick<MemberPlansDao, 'find'>;
  tokens: Pick<SavedTokensDao, 'listOf' | 'remove'>;
  /** Every image of a saved token must be an image of the table, as on a token. */
  assets: Pick<AssetsDao, 'findManyInCampaign'>;
  transaction: SavedTokensTransactionRunner;
  maximums: SavedTokenMaximums;
}>;

/** The saved tokens of the session's user at one table: only the owner lists, saves, edits and
 *  deletes them; the spectator, who does not create tokens, is refused before any read.
 *
 *  Example: `await service.create({ campaignId, userId }, { name: 'Zumbi', token })` */
export class SavedTokensService {
  private readonly rules: SavedTokenRulesBo;

  constructor(private readonly deps: SavedTokensServiceDeps) {
    this.rules = new SavedTokenRulesBo(deps.maximums);
  }

  async list(owner: SavedTokenOwner): Promise<SavedTokensResponseDto> {
    await this.requireMember(owner);
    const plans = await this.deps.plans.find(owner.campaignId, owner.userId);
    if (!plans) throw new CampaignNotFoundError(owner);
    const limits = memberSavedTokenLimitsOf(plans);
    const rows = await this.deps.tokens.listOf(owner);
    // `listOf` is in creation order: the index is the rank.
    return { savedTokens: rows.map((row, rank) => this.dtoOf(row, rank, limits)) };
  }

  /** Counts and inserts under the member's lock, so two saves never pass the ceiling together. */
  async create(owner: SavedTokenOwner, input: CreateSavedTokenRequestDto): Promise<SavedTokenDto> {
    await this.requireMember(owner);
    await requireAssetsOf(this.deps, owner.campaignId, assetIdsOf(input.token));
    return this.deps.transaction(async ({ plans, tokens, folders }) => {
      const limits = await lockedLimitsOf(plans, owner);
      const kept = await tokens.countOf(owner);
      this.rules.requireRoomFor(kept, limits);
      await requireOwnFolder(folders, owner, input.folderId);
      const { row, forms } = toNewSavedTokenRows(owner, input);
      return this.dtoOf(await tokens.insert(row, forms), kept, limits);
    });
  }

  async update(
    owner: SavedTokenOwner,
    savedTokenId: string,
    changes: UpdateSavedTokenRequestDto,
  ): Promise<SavedTokenDto> {
    await this.requireMember(owner);
    if (changes.token)
      await requireAssetsOf(this.deps, owner.campaignId, assetIdsOf(changes.token));
    return this.deps.transaction(async ({ plans, tokens, folders }) => {
      const limits = await lockedLimitsOf(plans, owner);
      const rank = await tokens.rankOf(owner, savedTokenId);
      if (rank === undefined) throw notFound(owner, savedTokenId);
      if (changes.name !== undefined || changes.token) this.rules.requireConfigurable(rank, limits);
      await requireOwnFolder(folders, owner, changes.folderId);
      const row = await this.write(tokens, owner, savedTokenId, changes);
      return this.dtoOf(row, rank, limits);
    });
  }

  async remove(owner: SavedTokenOwner, savedTokenId: string): Promise<void> {
    await this.requireMember(owner);
    if (await this.deps.tokens.remove(owner, savedTokenId)) return;
    throw notFound(owner, savedTokenId);
  }

  private async write(
    tokens: SavedTokenWriteDaos['tokens'],
    owner: SavedTokenOwner,
    savedTokenId: string,
    changes: UpdateSavedTokenRequestDto,
  ): Promise<SavedTokenRow> {
    const { name, folderId, token } = changes;
    const replaced = token === undefined ? undefined : toSavedTokenWrite(token);
    const columns = { name, folderId, ...replaced?.columns };
    const row = await tokens.update(owner, savedTokenId, definedOf(columns), replaced?.forms);
    if (!row) throw notFound(owner, savedTokenId);
    return row;
  }

  private dtoOf(row: SavedTokenRow, rank: number, limits: MemberSavedRollLimits): SavedTokenDto {
    return toSavedTokenDto(row, this.rules.isPlanLocked(rank, limits));
  }

  private async requireMember(owner: SavedTokenOwner): Promise<void> {
    await memberAccessOf(this.deps.members, owner.campaignId, owner.userId);
  }
}

/** The member's lock, so two writes of the same member go one after the other, and the two plans
 *  of the ceiling read in it.
 *
 *  Example: `const limits = await lockedLimitsOf(plans, owner)` */
export async function lockedLimitsOf(
  plans: Pick<MemberPlansDao, 'lock'>,
  owner: SavedTokenOwner,
): Promise<MemberSavedRollLimits> {
  const locked = await plans.lock(owner.campaignId, owner.userId);
  if (!locked) throw new CampaignNotFoundError(owner);
  return memberSavedTokenLimitsOf(locked);
}

// The foreign key only says the folder exists; whose it is, the owner's query says.
async function requireOwnFolder(
  folders: Pick<SavedTokenFoldersDao, 'findOf'>,
  owner: SavedTokenOwner,
  folderId: string | null | undefined,
): Promise<void> {
  if (folderId === undefined || folderId === null) return;
  if (await folders.findOf(owner, folderId)) return;
  throw new SavedTokenFolderNotFoundError(owner.campaignId, owner.userId, folderId);
}

function definedOf<T extends object>(changes: T): Partial<T> {
  const entries = Object.entries(changes).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as Partial<T>;
}

function notFound(owner: SavedTokenOwner, savedTokenId: string): SavedTokenNotFoundError {
  return new SavedTokenNotFoundError(owner.campaignId, owner.userId, savedTokenId);
}
