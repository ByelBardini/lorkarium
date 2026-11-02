import {
  savedRollDto,
  savedRollFolderDto,
  savedRollFoldersResponseDto,
  savedRollsResponseDto,
  type CreateSavedRollRequestDto,
  type SavedRollDto,
  type SavedRollFolderDto,
  type UpdateSavedRollRequestDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { callApi, errorCodeOf, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpMethod, HttpResponse, HttpTransport } from './http-transport';

export type SavedRollsFailure =
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{
      kind:
        | 'name_taken'
        | 'limit'
        | 'folder_name_taken'
        | 'folder_limit'
        | 'folder_not_found'
        | 'invalid_expression'
        | 'not_found'
        | 'forbidden'
        | 'invalid'
        | 'unauthenticated'
        | 'offline'
        | 'unexpected';
    }>;

export type SavedRollsFailureKind = SavedRollsFailure['kind'];

export type SavedRollsResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: SavedRollsFailure }>;

/** The saved rolls of the session's own member at one table (`/api/campaigns/:id/saved-rolls`):
 *  only the owner sees and edits them. Failures come back as values.
 *
 *  Example: `const result = await savedRolls.list(campaignId); if (result.ok) result.value` */
export interface SavedRollsApi {
  list(campaignId: string): Promise<SavedRollsResult<readonly SavedRollDto[]>>;
  create(
    campaignId: string,
    input: CreateSavedRollRequestDto,
  ): Promise<SavedRollsResult<SavedRollDto>>;
  update(
    campaignId: string,
    savedRollId: string,
    changes: UpdateSavedRollRequestDto,
  ): Promise<SavedRollsResult<SavedRollDto>>;
  remove(campaignId: string, savedRollId: string): Promise<SavedRollsResult<null>>;
  listFolders(campaignId: string): Promise<SavedRollsResult<readonly SavedRollFolderDto[]>>;
  createFolder(campaignId: string, name: string): Promise<SavedRollsResult<SavedRollFolderDto>>;
  renameFolder(
    campaignId: string,
    folderId: string,
    name: string,
  ): Promise<SavedRollsResult<SavedRollFolderDto>>;
  removeFolder(campaignId: string, folderId: string): Promise<SavedRollsResult<null>>;
}

// The saved rolls' own refusals by code; the rest by status.
const FAILURE_BY_CODE: Readonly<Record<string, SavedRollsFailure>> = {
  SAVED_ROLL_NAME_TAKEN: { kind: 'name_taken' },
  SAVED_ROLLS_LIMIT: { kind: 'limit' },
  SAVED_ROLL_FOLDER_NAME_TAKEN: { kind: 'folder_name_taken' },
  SAVED_ROLL_FOLDERS_LIMIT: { kind: 'folder_limit' },
  SAVED_ROLL_FOLDER_NOT_FOUND: { kind: 'folder_not_found' },
  INVALID_DICE_EXPRESSION: { kind: 'invalid_expression' },
};

const FAILURE_BY_STATUS: Readonly<Record<number, SavedRollsFailure>> = {
  400: { kind: 'invalid' },
  401: { kind: 'unauthenticated' },
  403: { kind: 'forbidden' },
  404: { kind: 'not_found' },
};

/** `SavedRollsApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `await new HttpSavedRollsApi(transport).create(campaignId, { name: 'Acerto', parts })` */
export class HttpSavedRollsApi implements SavedRollsApi {
  constructor(private readonly transport: HttpTransport) {}

  async list(campaignId: string): Promise<SavedRollsResult<readonly SavedRollDto[]>> {
    const call = await callApi(this.transport, 'GET', savedRollsPath(campaignId));
    if (call.kind !== 'ok') return failed(call);
    return parseOk(savedRollsResponseDto, call.body, (body) => body.savedRolls);
  }

  create(
    campaignId: string,
    input: CreateSavedRollRequestDto,
  ): Promise<SavedRollsResult<SavedRollDto>> {
    return this.answer('POST', savedRollsPath(campaignId), savedRollDto, input);
  }

  update(
    campaignId: string,
    savedRollId: string,
    changes: UpdateSavedRollRequestDto,
  ): Promise<SavedRollsResult<SavedRollDto>> {
    return this.answer('PATCH', savedRollPath(campaignId, savedRollId), savedRollDto, changes);
  }

  async remove(campaignId: string, savedRollId: string): Promise<SavedRollsResult<null>> {
    const call = await callApi(this.transport, 'DELETE', savedRollPath(campaignId, savedRollId));
    return call.kind === 'ok' ? { ok: true, value: null } : failed(call);
  }

  async listFolders(campaignId: string): Promise<SavedRollsResult<readonly SavedRollFolderDto[]>> {
    const call = await callApi(this.transport, 'GET', foldersPath(campaignId));
    if (call.kind !== 'ok') return failed(call);
    return parseOk(savedRollFoldersResponseDto, call.body, (body) => body.folders);
  }

  createFolder(campaignId: string, name: string): Promise<SavedRollsResult<SavedRollFolderDto>> {
    return this.answer('POST', foldersPath(campaignId), savedRollFolderDto, { name });
  }

  renameFolder(
    campaignId: string,
    folderId: string,
    name: string,
  ): Promise<SavedRollsResult<SavedRollFolderDto>> {
    const path = folderPath(campaignId, folderId);
    return this.answer('PATCH', path, savedRollFolderDto, { name });
  }

  async removeFolder(campaignId: string, folderId: string): Promise<SavedRollsResult<null>> {
    const call = await callApi(this.transport, 'DELETE', folderPath(campaignId, folderId));
    return call.kind === 'ok' ? { ok: true, value: null } : failed(call);
  }

  private async answer<S extends z.ZodType>(
    method: HttpMethod,
    path: string,
    dto: S,
    body: unknown,
  ): Promise<SavedRollsResult<z.infer<S>>> {
    const call = await callApi(this.transport, method, path, body);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(dto, call.body, (parsed) => parsed);
  }
}

function savedRollsPath(campaignId: string): string {
  return `/campaigns/${encodeURIComponent(campaignId)}/saved-rolls`;
}

function savedRollPath(campaignId: string, savedRollId: string): string {
  return `${savedRollsPath(campaignId)}/${encodeURIComponent(savedRollId)}`;
}

function foldersPath(campaignId: string): string {
  return `/campaigns/${encodeURIComponent(campaignId)}/saved-roll-folders`;
}

function folderPath(campaignId: string, folderId: string): string {
  return `${foldersPath(campaignId)}/${encodeURIComponent(folderId)}`;
}

function failed(call: Exclude<ApiCall, { kind: 'ok' }>): SavedRollsResult<never> {
  if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' } };
  return { ok: false, failure: failureOf(call.response) };
}

function failureOf(response: HttpResponse): SavedRollsFailure {
  if (response.status === 429) {
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(response) };
  }
  const byCode = FAILURE_BY_CODE[errorCodeOf(response) ?? ''];
  if (byCode) return byCode;
  return FAILURE_BY_STATUS[response.status] ?? { kind: 'unexpected' };
}
