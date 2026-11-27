import {
  savedTokenDto,
  savedTokenFolderDto,
  savedTokenFoldersResponseDto,
  savedTokensResponseDto,
  type CreateSavedTokenRequestInput,
  type SavedTokenDto,
  type SavedTokenFolderDto,
  type UpdateSavedTokenRequestInput,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import {
  callApi,
  errorCodeOf,
  parseOk,
  planLimitFailureOf,
  retryAfterOf,
  type ApiCall,
  type PlanLimitFailure,
} from './api-call';
import type { HttpMethod, HttpResponse, HttpTransport } from './http-transport';

export type SavedTokensFailure =
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{
      kind:
        | 'limit'
        | 'folder_name_taken'
        | 'folder_limit'
        | 'folder_not_found'
        | 'image_not_found'
        | 'not_found'
        | 'forbidden'
        | 'invalid'
        | 'unauthenticated'
        | 'offline'
        | 'unexpected';
    }>
  /** The plan ran out (saved tokens, folders): 403 `PLAN_LIMIT`. */
  | PlanLimitFailure;

export type SavedTokensFailureKind = SavedTokensFailure['kind'];

export type SavedTokensResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: SavedTokensFailure }>;

/** The saved tokens of the session's own member at one table (`/api/campaigns/:id/saved-tokens`):
 *  only the owner sees and edits them. Failures come back as values.
 *
 *  Example: `const result = await savedTokens.list(campaignId); if (result.ok) result.value` */
export interface SavedTokensApi {
  list(campaignId: string): Promise<SavedTokensResult<readonly SavedTokenDto[]>>;
  create(
    campaignId: string,
    input: CreateSavedTokenRequestInput,
  ): Promise<SavedTokensResult<SavedTokenDto>>;
  update(
    campaignId: string,
    savedTokenId: string,
    changes: UpdateSavedTokenRequestInput,
  ): Promise<SavedTokensResult<SavedTokenDto>>;
  remove(campaignId: string, savedTokenId: string): Promise<SavedTokensResult<null>>;
  listFolders(campaignId: string): Promise<SavedTokensResult<readonly SavedTokenFolderDto[]>>;
  createFolder(campaignId: string, name: string): Promise<SavedTokensResult<SavedTokenFolderDto>>;
  renameFolder(
    campaignId: string,
    folderId: string,
    name: string,
  ): Promise<SavedTokensResult<SavedTokenFolderDto>>;
  removeFolder(campaignId: string, folderId: string): Promise<SavedTokensResult<null>>;
}

// The saved tokens' own refusals by code; the rest by status.
const FAILURE_BY_CODE: Readonly<Record<string, SavedTokensFailure>> = {
  SAVED_TOKENS_LIMIT: { kind: 'limit' },
  SAVED_TOKEN_FOLDER_NAME_TAKEN: { kind: 'folder_name_taken' },
  SAVED_TOKEN_FOLDERS_LIMIT: { kind: 'folder_limit' },
  SAVED_TOKEN_FOLDER_NOT_FOUND: { kind: 'folder_not_found' },
  ASSET_NOT_FOUND: { kind: 'image_not_found' },
};

const FAILURE_BY_STATUS: Readonly<Record<number, SavedTokensFailure>> = {
  400: { kind: 'invalid' },
  401: { kind: 'unauthenticated' },
  403: { kind: 'forbidden' },
  404: { kind: 'not_found' },
};

/** `SavedTokensApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `await new HttpSavedTokensApi(transport).create(campaignId, { name: 'Zumbi', token })` */
export class HttpSavedTokensApi implements SavedTokensApi {
  constructor(private readonly transport: HttpTransport) {}

  async list(campaignId: string): Promise<SavedTokensResult<readonly SavedTokenDto[]>> {
    const call = await callApi(this.transport, 'GET', savedTokensPath(campaignId));
    if (call.kind !== 'ok') return failed(call);
    return parseOk(savedTokensResponseDto, call.body, (body) => body.savedTokens);
  }

  create(
    campaignId: string,
    input: CreateSavedTokenRequestInput,
  ): Promise<SavedTokensResult<SavedTokenDto>> {
    return this.answer('POST', savedTokensPath(campaignId), savedTokenDto, input);
  }

  update(
    campaignId: string,
    savedTokenId: string,
    changes: UpdateSavedTokenRequestInput,
  ): Promise<SavedTokensResult<SavedTokenDto>> {
    return this.answer('PATCH', savedTokenPath(campaignId, savedTokenId), savedTokenDto, changes);
  }

  async remove(campaignId: string, savedTokenId: string): Promise<SavedTokensResult<null>> {
    const call = await callApi(this.transport, 'DELETE', savedTokenPath(campaignId, savedTokenId));
    return call.kind === 'ok' ? { ok: true, value: null } : failed(call);
  }

  async listFolders(
    campaignId: string,
  ): Promise<SavedTokensResult<readonly SavedTokenFolderDto[]>> {
    const call = await callApi(this.transport, 'GET', foldersPath(campaignId));
    if (call.kind !== 'ok') return failed(call);
    return parseOk(savedTokenFoldersResponseDto, call.body, (body) => body.folders);
  }

  createFolder(campaignId: string, name: string): Promise<SavedTokensResult<SavedTokenFolderDto>> {
    return this.answer('POST', foldersPath(campaignId), savedTokenFolderDto, { name });
  }

  renameFolder(
    campaignId: string,
    folderId: string,
    name: string,
  ): Promise<SavedTokensResult<SavedTokenFolderDto>> {
    const path = folderPath(campaignId, folderId);
    return this.answer('PATCH', path, savedTokenFolderDto, { name });
  }

  async removeFolder(campaignId: string, folderId: string): Promise<SavedTokensResult<null>> {
    const call = await callApi(this.transport, 'DELETE', folderPath(campaignId, folderId));
    return call.kind === 'ok' ? { ok: true, value: null } : failed(call);
  }

  private async answer<S extends z.ZodType>(
    method: HttpMethod,
    path: string,
    dto: S,
    body: unknown,
  ): Promise<SavedTokensResult<z.infer<S>>> {
    const call = await callApi(this.transport, method, path, body);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(dto, call.body, (parsed) => parsed);
  }
}

function savedTokensPath(campaignId: string): string {
  return `/campaigns/${encodeURIComponent(campaignId)}/saved-tokens`;
}

function savedTokenPath(campaignId: string, savedTokenId: string): string {
  return `${savedTokensPath(campaignId)}/${encodeURIComponent(savedTokenId)}`;
}

function foldersPath(campaignId: string): string {
  return `/campaigns/${encodeURIComponent(campaignId)}/saved-token-folders`;
}

function folderPath(campaignId: string, folderId: string): string {
  return `${foldersPath(campaignId)}/${encodeURIComponent(folderId)}`;
}

function failed(call: Exclude<ApiCall, { kind: 'ok' }>): SavedTokensResult<never> {
  if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' } };
  return { ok: false, failure: failureOf(call.response) };
}

function failureOf(response: HttpResponse): SavedTokensFailure {
  if (response.status === 429) {
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(response) };
  }
  const planLimit = planLimitFailureOf(response);
  if (planLimit) return planLimit;
  const byCode = FAILURE_BY_CODE[errorCodeOf(response) ?? ''];
  if (byCode) return byCode;
  return FAILURE_BY_STATUS[response.status] ?? { kind: 'unexpected' };
}
