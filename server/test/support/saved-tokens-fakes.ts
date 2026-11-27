import type { UserPlanPo } from '../../src/modules/auth/users.po';
import type { MemberPlansDao, MemberPlansPo } from '../../src/modules/plans/member-plans.dao';
import type { SavedTokenFoldersDao } from '../../src/modules/saved-tokens/saved-token-folders.dao';
import type {
  SavedTokenOwner,
  SavedTokensDao,
} from '../../src/modules/saved-tokens/saved-tokens.dao';
import type {
  NewSavedTokenFolderPo,
  NewSavedTokenPo,
  SavedTokenChangesPo,
  SavedTokenFolderPo,
  SavedTokenFormInputPo,
  SavedTokenPo,
  SavedTokenRow,
} from '../../src/modules/saved-tokens/saved-tokens.po';
import type {
  SavedTokensTransactionRunner,
  SavedTokenWriteDaos,
} from '../../src/modules/saved-tokens/saved-tokens.service';
import { BIA_ID, VHARN_ID } from './campaigns-factories';
import { planAccount } from './plan-account-fakes';
import { zombieBodyPo } from './saved-tokens-factories';

export const ZOMBIE_ID = '3c5e7a91-2b4d-4f6a-8c0e-1d3f5a7b9c2e';
export const MORTOS_ID = '4d6f8b02-3c5e-4a7b-9d1f-2e4a6b8c0d3f';
const FAKE_DATE = new Date('2026-11-26T12:00:00Z');

/** The saved token "Zumbi" of Bia at Vharn.
 *
 *  Example: `savedTokenRowPo({ name: 'Esqueleto' })` */
export function savedTokenRowPo(overrides: Partial<SavedTokenPo> = {}): SavedTokenRow {
  const savedToken: SavedTokenPo = {
    id: ZOMBIE_ID,
    campaignId: VHARN_ID,
    userId: BIA_ID,
    folderId: null,
    name: 'Zumbi',
    imageAssetId: null,
    auraImageAssetId: null,
    activeForm: null,
    body: zombieBodyPo(),
    createdAt: FAKE_DATE,
    updatedAt: FAKE_DATE,
    ...overrides,
  };
  return { savedToken, forms: [] };
}

/** The folder "Mortos-vivos" of Bia at Vharn.
 *
 *  Example: `savedTokenFolderPo({ userId: CAIO_ID })` */
export function savedTokenFolderPo(
  overrides: Partial<SavedTokenFolderPo> = {},
): SavedTokenFolderPo {
  return {
    id: MORTOS_ID,
    campaignId: VHARN_ID,
    userId: BIA_ID,
    name: 'Mortos-vivos',
    nameKey: 'mortos-vivos',
    createdAt: FAKE_DATE,
    ...overrides,
  };
}

function isOwnedBy(row: Readonly<{ campaignId: string; userId: string }>, owner: SavedTokenOwner) {
  return row.campaignId === owner.campaignId && row.userId === owner.userId;
}

/** The two plans of each member: members not in `owners` are gone. A table without a plan set
 *  answers `planAccount()` (everything open); a member without one is on Grátis. Writes `lock`. */
export class MemberPlansDaoFake implements Pick<MemberPlansDao, 'lock' | 'find'> {
  readonly owners = new Set<string>([`${VHARN_ID}:${BIA_ID}`]);
  readonly tablePlans = new Map<string, UserPlanPo>();
  readonly memberPlans = new Map<string, UserPlanPo>();

  constructor(private readonly journal: string[]) {}

  async lock(campaignId: string, userId: string): Promise<MemberPlansPo | undefined> {
    this.journal.push('lock');
    return this.find(campaignId, userId);
  }

  async find(campaignId: string, userId: string): Promise<MemberPlansPo | undefined> {
    if (!this.owners.has(`${campaignId}:${userId}`)) return undefined;
    const tableOwner = this.tablePlans.get(campaignId) ?? planAccount();
    return { tableOwner, member: this.memberPlans.get(userId) ?? planAccount({ plan: 'free' }) };
  }
}

/** In-memory saved tokens, in the order they were pushed (the creation order). Writes `count`,
 *  `rank`, `insert:<name>`, `update:<id>` and `remove:<id>` in the journal. */
export class SavedTokensDaoFake implements Pick<
  SavedTokensDao,
  'listOf' | 'countOf' | 'rankOf' | 'insert' | 'update' | 'remove'
> {
  /** The forms of the last `update` that replaced them (`undefined` when none did). */
  lastReplacedForms: readonly SavedTokenFormInputPo[] | undefined;

  constructor(
    private readonly journal: string[],
    readonly rows: SavedTokenRow[] = [],
  ) {}

  async listOf(owner: SavedTokenOwner): Promise<SavedTokenRow[]> {
    return this.ownedBy(owner);
  }

  async countOf(owner: SavedTokenOwner): Promise<number> {
    this.journal.push('count');
    return this.ownedBy(owner).length;
  }

  async rankOf(owner: SavedTokenOwner, savedTokenId: string): Promise<number | undefined> {
    this.journal.push('rank');
    const rank = this.ownedBy(owner).findIndex((row) => row.savedToken.id === savedTokenId);
    return rank < 0 ? undefined : rank;
  }

  async insert(
    row: NewSavedTokenPo,
    forms: readonly SavedTokenFormInputPo[],
  ): Promise<SavedTokenRow> {
    this.journal.push(`insert:${row.name}`);
    const id = `saved-${this.rows.length + 1}`;
    const inserted = savedTokenRowPo({ ...row, id, folderId: row.folderId ?? null });
    const withForms = { ...inserted, forms: formsOf(id, forms) };
    this.rows.push(withForms);
    return withForms;
  }

  async update(
    owner: SavedTokenOwner,
    savedTokenId: string,
    changes: SavedTokenChangesPo,
    forms?: readonly SavedTokenFormInputPo[],
  ): Promise<SavedTokenRow | undefined> {
    const index = this.rows.findIndex(
      (row) => isOwnedBy(row.savedToken, owner) && row.savedToken.id === savedTokenId,
    );
    const found = this.rows[index];
    if (!found) return undefined;
    this.journal.push(`update:${savedTokenId}`);
    this.lastReplacedForms = forms;
    const savedToken = { ...found.savedToken, ...changes };
    const updated = { savedToken, forms: forms ? formsOf(savedTokenId, forms) : found.forms };
    this.rows[index] = updated;
    return updated;
  }

  async remove(owner: SavedTokenOwner, savedTokenId: string): Promise<boolean> {
    const index = this.rows.findIndex(
      (row) => isOwnedBy(row.savedToken, owner) && row.savedToken.id === savedTokenId,
    );
    if (index < 0) return false;
    this.journal.push(`remove:${savedTokenId}`);
    this.rows.splice(index, 1);
    return true;
  }

  private ownedBy(owner: SavedTokenOwner): SavedTokenRow[] {
    return this.rows.filter((row) => isOwnedBy(row.savedToken, owner));
  }
}

function formsOf(savedTokenId: string, forms: readonly SavedTokenFormInputPo[]) {
  return forms.map((form, position) => ({ ...form, savedTokenId, position }));
}

/** What Drizzle throws when `saved_token_folders_member_name_unique` refuses a repeated name. */
export class SavedTokenFolderNameViolationFake extends Error {
  override readonly cause = {
    code: '23505',
    constraint: 'saved_token_folders_member_name_unique',
  };
}

/** In-memory folders; a repeated name key of the same owner throws like the unique index. Writes
 *  `folder:find`, `folder:count`, `folder:insert:<name>`, `folder:rename:<id>`, `folder:remove:<id>`. */
export class SavedTokenFoldersDaoFake implements Pick<
  SavedTokenFoldersDao,
  'listOf' | 'findOf' | 'countOf' | 'insert' | 'rename' | 'remove'
> {
  constructor(
    private readonly journal: string[],
    readonly rows: SavedTokenFolderPo[] = [],
  ) {}

  async listOf(owner: SavedTokenOwner): Promise<SavedTokenFolderPo[]> {
    return this.rows.filter((row) => isOwnedBy(row, owner));
  }

  async findOf(owner: SavedTokenOwner, folderId: string): Promise<SavedTokenFolderPo | undefined> {
    this.journal.push('folder:find');
    return this.rows.find((row) => isOwnedBy(row, owner) && row.id === folderId);
  }

  async countOf(owner: SavedTokenOwner): Promise<number> {
    this.journal.push('folder:count');
    return this.rows.filter((row) => isOwnedBy(row, owner)).length;
  }

  async insert(row: NewSavedTokenFolderPo): Promise<SavedTokenFolderPo> {
    this.requireFreeName(row, row.nameKey, null);
    this.journal.push(`folder:insert:${row.name}`);
    const inserted = savedTokenFolderPo({ ...row, id: `folder-${this.rows.length + 1}` });
    this.rows.push(inserted);
    return inserted;
  }

  async rename(
    owner: SavedTokenOwner,
    folderId: string,
    named: Pick<SavedTokenFolderPo, 'name' | 'nameKey'>,
  ): Promise<SavedTokenFolderPo | undefined> {
    const found = this.rows.find((row) => isOwnedBy(row, owner) && row.id === folderId);
    if (!found) return undefined;
    this.requireFreeName(owner, named.nameKey, folderId);
    this.journal.push(`folder:rename:${folderId}`);
    Object.assign(found, named);
    return found;
  }

  async remove(owner: SavedTokenOwner, folderId: string): Promise<boolean> {
    const index = this.rows.findIndex((row) => isOwnedBy(row, owner) && row.id === folderId);
    if (index < 0) return false;
    this.journal.push(`folder:remove:${folderId}`);
    this.rows.splice(index, 1);
    return true;
  }

  private requireFreeName(owner: SavedTokenOwner, nameKey: string, exceptId: string | null): void {
    const taken = this.rows.some(
      (row) => isOwnedBy(row, owner) && row.nameKey === nameKey && row.id !== exceptId,
    );
    if (taken) throw new SavedTokenFolderNameViolationFake('duplicate key');
  }
}

/** Runs the work on the fakes and writes `commit` when it returns. */
export class SavedTokensTransactionRunnerFake {
  constructor(
    private readonly journal: string[],
    private readonly daos: SavedTokenWriteDaos,
  ) {}

  readonly run: SavedTokensTransactionRunner = async (work) => {
    const result = await work(this.daos);
    this.journal.push('commit');
    return result;
  };
}
