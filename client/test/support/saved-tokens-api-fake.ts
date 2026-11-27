import type {
  CreateSavedTokenRequestInput,
  SavedTokenDto,
  SavedTokenFolderDto,
  UpdateSavedTokenRequestInput,
} from '@lorkarium/contracts';
import { savedTokenBodyDto } from '@lorkarium/contracts';
import type {
  SavedTokensApi,
  SavedTokensFailure,
  SavedTokensResult,
} from '@/services/saved-tokens-api';

/** The saved tokens of one member in memory; `failNext` makes the next call answer that failure,
 *  and `holdLists` keeps the lists waiting until `releaseLists`. `calls` records each call. */
export class SavedTokensApiFake implements SavedTokensApi {
  readonly calls: string[] = [];
  private pendingFailure: SavedTokensFailure | null = null;
  private held: (() => void)[] | null = null;

  constructor(
    public savedTokens: SavedTokenDto[] = [],
    public folders: SavedTokenFolderDto[] = [],
  ) {}

  failNext(failure: SavedTokensFailure): void {
    this.pendingFailure = failure;
  }

  holdLists(): void {
    this.held = [];
  }

  releaseLists(): void {
    const held = this.held ?? [];
    this.held = null;
    for (const release of held) release();
  }

  async list(): Promise<SavedTokensResult<readonly SavedTokenDto[]>> {
    this.calls.push('list');
    await this.waitIfHeld();
    return this.answer(() => [...this.savedTokens]);
  }

  async create(
    _campaignId: string,
    input: CreateSavedTokenRequestInput,
  ): Promise<SavedTokensResult<SavedTokenDto>> {
    this.calls.push(`create:${input.name}`);
    return this.answer(() => {
      const id = `00000000-0000-4000-8000-${String(this.savedTokens.length + 1).padStart(12, '0')}`;
      const token = savedTokenBodyDto.parse(input.token);
      const saved = {
        id,
        name: input.name,
        folderId: input.folderId ?? null,
        token,
        planLocked: false,
      };
      this.savedTokens.push(saved);
      return saved;
    });
  }

  async update(
    _campaignId: string,
    savedTokenId: string,
    changes: UpdateSavedTokenRequestInput,
  ): Promise<SavedTokensResult<SavedTokenDto>> {
    this.calls.push(`update:${savedTokenId}`);
    return this.answer(() => {
      const index = this.savedTokens.findIndex((saved) => saved.id === savedTokenId);
      const found = this.savedTokens[index];
      if (!found) throw new Error(`no saved token ${savedTokenId}; expected one of the fake's`);
      const token = changes.token ? savedTokenBodyDto.parse(changes.token) : found.token;
      const updated = { ...found, ...changes, token };
      this.savedTokens[index] = updated;
      return updated;
    });
  }

  async remove(_campaignId: string, savedTokenId: string): Promise<SavedTokensResult<null>> {
    this.calls.push(`remove:${savedTokenId}`);
    return this.answer(() => {
      this.savedTokens = this.savedTokens.filter((saved) => saved.id !== savedTokenId);
      return null;
    });
  }

  async listFolders(): Promise<SavedTokensResult<readonly SavedTokenFolderDto[]>> {
    this.calls.push('listFolders');
    await this.waitIfHeld();
    return this.answer(() => [...this.folders]);
  }

  async createFolder(
    _campaignId: string,
    name: string,
  ): Promise<SavedTokensResult<SavedTokenFolderDto>> {
    this.calls.push(`createFolder:${name}`);
    return this.answer(() => {
      const folder = { id: `folder-${this.folders.length + 1}`, name };
      this.folders.push(folder);
      return folder;
    });
  }

  async renameFolder(
    _campaignId: string,
    folderId: string,
    name: string,
  ): Promise<SavedTokensResult<SavedTokenFolderDto>> {
    this.calls.push(`renameFolder:${folderId}`);
    return this.answer(() => ({ id: folderId, name }));
  }

  async removeFolder(_campaignId: string, folderId: string): Promise<SavedTokensResult<null>> {
    this.calls.push(`removeFolder:${folderId}`);
    return this.answer(() => {
      this.folders = this.folders.filter((folder) => folder.id !== folderId);
      return null;
    });
  }

  private async waitIfHeld(): Promise<void> {
    const held = this.held;
    if (held === null) return;
    await new Promise<void>((resolve) => held.push(resolve));
  }

  private answer<T>(value: () => T): SavedTokensResult<T> {
    const failure = this.pendingFailure;
    this.pendingFailure = null;
    if (failure) return { ok: false, failure };
    return { ok: true, value: value() };
  }
}
