import {
  campaignLibraryDto,
  libraryImageDto,
  type CampaignLibraryDto,
  type LibraryImageDto,
  type CreateLibraryImageRequestDto,
  type UpdateLibraryImageRequestDto,
  librarySceneDto,
  sceneFolderDto,
  type CreateLibrarySceneRequestDto,
  type CreateSceneFolderRequestDto,
  type LibrarySceneDto,
  type SceneFolderDto,
  type UpdateLibrarySceneRequestDto,
  type UpdateSceneFolderRequestDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { callApi, errorCodeOf, parseOk, type ApiCall } from './api-call';
import type { HttpMethod, HttpResponse, HttpTransport } from './http-transport';

export type LibraryFailure = Readonly<{
  kind:
    | 'scene_is_active'
    | 'folder_cycle'
    | 'folder_too_deep'
    | 'folder_not_found'
    | 'not_found'
    | 'forbidden'
    | 'invalid'
    | 'unauthenticated'
    | 'offline'
    | 'unexpected';
}>;

export type LibraryFailureKind = LibraryFailure['kind'];

export type LibraryResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: LibraryFailure }>;

/** The scene library of a table (`/api/campaigns/:id/scenes` and `/scene-folders`): grids and
 *  folders, filtered by the server for the requester's role. Failures come back as values.
 *
 *  Example: `const result = await libraryApi.list(campaignId); if (result.ok) result.value.scenes` */
export interface LibraryApi {
  list(campaignId: string): Promise<LibraryResult<CampaignLibraryDto>>;
  createImage(
    campaignId: string,
    input: CreateLibraryImageRequestDto,
  ): Promise<LibraryResult<LibraryImageDto>>;
  updateImage(
    campaignId: string,
    imageId: string,
    changes: UpdateLibraryImageRequestDto,
  ): Promise<LibraryResult<LibraryImageDto>>;
  removeImage(campaignId: string, imageId: string): Promise<LibraryResult<null>>;
  createScene(
    campaignId: string,
    input: CreateLibrarySceneRequestDto,
  ): Promise<LibraryResult<LibrarySceneDto>>;
  updateScene(
    campaignId: string,
    sceneId: string,
    changes: UpdateLibrarySceneRequestDto,
  ): Promise<LibraryResult<LibrarySceneDto>>;
  duplicateScene(campaignId: string, sceneId: string): Promise<LibraryResult<LibrarySceneDto>>;
  removeScene(campaignId: string, sceneId: string): Promise<LibraryResult<null>>;
  createFolder(
    campaignId: string,
    input: CreateSceneFolderRequestDto,
  ): Promise<LibraryResult<SceneFolderDto>>;
  updateFolder(
    campaignId: string,
    folderId: string,
    changes: UpdateSceneFolderRequestDto,
  ): Promise<LibraryResult<SceneFolderDto>>;
  removeFolder(campaignId: string, folderId: string): Promise<LibraryResult<null>>;
}

// The library's own refusals by code; the rest by status.
const FAILURE_BY_CODE: Readonly<Record<string, LibraryFailure>> = {
  SCENE_IS_ACTIVE: { kind: 'scene_is_active' },
  FOLDER_CYCLE: { kind: 'folder_cycle' },
  FOLDER_TOO_DEEP: { kind: 'folder_too_deep' },
  FOLDER_NOT_FOUND: { kind: 'folder_not_found' },
};

const FAILURE_BY_STATUS: Readonly<Record<number, LibraryFailure>> = {
  400: { kind: 'invalid' },
  401: { kind: 'unauthenticated' },
  403: { kind: 'forbidden' },
  404: { kind: 'not_found' },
};

/** `LibraryApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `await new HttpLibraryApi(transport).updateScene(campaignId, torreId, { visibility: 'public' })` */
export class HttpLibraryApi implements LibraryApi {
  constructor(private readonly transport: HttpTransport) {}

  list(campaignId: string): Promise<LibraryResult<CampaignLibraryDto>> {
    return this.answer(
      'GET',
      `/campaigns/${encodeURIComponent(campaignId)}/library`,
      campaignLibraryDto,
    );
  }

  createImage(
    campaignId: string,
    input: CreateLibraryImageRequestDto,
  ): Promise<LibraryResult<LibraryImageDto>> {
    return this.answer('POST', imagesPath(campaignId), libraryImageDto, input);
  }

  updateImage(
    campaignId: string,
    imageId: string,
    changes: UpdateLibraryImageRequestDto,
  ): Promise<LibraryResult<LibraryImageDto>> {
    return this.answer(
      'PATCH',
      `${imagesPath(campaignId)}/${encodeURIComponent(imageId)}`,
      libraryImageDto,
      changes,
    );
  }

  removeImage(campaignId: string, imageId: string): Promise<LibraryResult<null>> {
    return this.remove(`${imagesPath(campaignId)}/${encodeURIComponent(imageId)}`);
  }

  createScene(
    campaignId: string,
    input: CreateLibrarySceneRequestDto,
  ): Promise<LibraryResult<LibrarySceneDto>> {
    return this.answer('POST', scenesPath(campaignId), librarySceneDto, input);
  }

  updateScene(
    campaignId: string,
    sceneId: string,
    changes: UpdateLibrarySceneRequestDto,
  ): Promise<LibraryResult<LibrarySceneDto>> {
    return this.answer('PATCH', scenePath(campaignId, sceneId), librarySceneDto, changes);
  }

  duplicateScene(campaignId: string, sceneId: string): Promise<LibraryResult<LibrarySceneDto>> {
    return this.answer('POST', `${scenePath(campaignId, sceneId)}/copies`, librarySceneDto);
  }

  removeScene(campaignId: string, sceneId: string): Promise<LibraryResult<null>> {
    return this.remove(scenePath(campaignId, sceneId));
  }

  createFolder(
    campaignId: string,
    input: CreateSceneFolderRequestDto,
  ): Promise<LibraryResult<SceneFolderDto>> {
    return this.answer('POST', foldersPath(campaignId), sceneFolderDto, input);
  }

  updateFolder(
    campaignId: string,
    folderId: string,
    changes: UpdateSceneFolderRequestDto,
  ): Promise<LibraryResult<SceneFolderDto>> {
    return this.answer('PATCH', folderPath(campaignId, folderId), sceneFolderDto, changes);
  }

  removeFolder(campaignId: string, folderId: string): Promise<LibraryResult<null>> {
    return this.remove(folderPath(campaignId, folderId));
  }

  private async answer<S extends z.ZodType>(
    method: HttpMethod,
    path: string,
    dto: S,
    body?: unknown,
  ): Promise<LibraryResult<z.infer<S>>> {
    const call = await callApi(this.transport, method, path, body);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(dto, call.body, (parsed) => parsed);
  }

  private async remove(path: string): Promise<LibraryResult<null>> {
    const call = await callApi(this.transport, 'DELETE', path);
    return call.kind === 'ok' ? { ok: true, value: null } : failed(call);
  }
}

function scenesPath(campaignId: string): string {
  return `/campaigns/${encodeURIComponent(campaignId)}/scenes`;
}

function scenePath(campaignId: string, sceneId: string): string {
  return `${scenesPath(campaignId)}/${encodeURIComponent(sceneId)}`;
}

function foldersPath(campaignId: string): string {
  return `/campaigns/${encodeURIComponent(campaignId)}/scene-folders`;
}

function folderPath(campaignId: string, folderId: string): string {
  return `${foldersPath(campaignId)}/${encodeURIComponent(folderId)}`;
}

function failed(call: Exclude<ApiCall, { kind: 'ok' }>): LibraryResult<never> {
  if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' } };
  return { ok: false, failure: failureOf(call.response) };
}

function failureOf(response: HttpResponse): LibraryFailure {
  const byCode = FAILURE_BY_CODE[errorCodeOf(response) ?? ''];
  if (byCode) return byCode;
  return FAILURE_BY_STATUS[response.status] ?? { kind: 'unexpected' };
}

function imagesPath(campaignId: string): string {
  return `/campaigns/${encodeURIComponent(campaignId)}/library-images`;
}
