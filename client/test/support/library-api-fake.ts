import type {
  CreateLibrarySceneRequestDto,
  CreateSceneFolderRequestDto,
  CampaignLibraryDto,
  CreateLibraryImageRequestDto,
  UpdateLibraryImageRequestDto,
  LibraryImageDto,
  LibrarySceneDto,
  SceneFolderDto,
  UpdateLibrarySceneRequestDto,
  UpdateSceneFolderRequestDto,
} from '@lorkarium/contracts';
import type { LibraryApi, LibraryResult } from '@/services/library-api';
import { masterLibrary, OSSUARIO, PORTRAIT, libraryScene } from './library-fixtures';

type Answers = {
  createImage: LibraryResult<LibraryImageDto>;
  updateImage: LibraryResult<LibraryImageDto>;
  removeImage: LibraryResult<null>;
  list: LibraryResult<CampaignLibraryDto>;
  createScene: LibraryResult<LibrarySceneDto>;
  updateScene: LibraryResult<LibrarySceneDto>;
  duplicateScene: LibraryResult<LibrarySceneDto>;
  removeScene: LibraryResult<null>;
  createFolder: LibraryResult<SceneFolderDto>;
  updateFolder: LibraryResult<SceneFolderDto>;
  removeFolder: LibraryResult<null>;
};

export type LibraryMethod = keyof Answers;

type Pending<T> = { promise: Promise<T>; resolve: (value: T) => void };

export const NEW_GRID: LibrarySceneDto = libraryScene({
  id: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
  name: 'Grid sem nome',
  widthCells: 20,
  heightCells: 12,
});

export const NEW_FOLDER: SceneFolderDto = {
  id: '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b',
  name: 'Masmorra',
  parentId: null,
};

/** Scripted `LibraryApi`: each method answers what the test set (or waits until released) and
 *  records `[campaignId, ...arguments]` per call. */
export class LibraryApiFake implements LibraryApi {
  readonly calls: Array<{ method: LibraryMethod; args: readonly unknown[] }> = [];
  private readonly answers: { [M in LibraryMethod]: Answers[M] | Pending<Answers[M]> } = {
    list: { ok: true, value: masterLibrary() },
    createImage: { ok: true, value: PORTRAIT },
    updateImage: { ok: true, value: PORTRAIT },
    removeImage: { ok: true, value: null },
    createScene: { ok: true, value: NEW_GRID },
    updateScene: { ok: true, value: OSSUARIO },
    duplicateScene: { ok: true, value: { ...OSSUARIO, id: NEW_GRID.id, name: 'Ossuário (cópia)' } },
    removeScene: { ok: true, value: null },
    createFolder: { ok: true, value: NEW_FOLDER },
    updateFolder: { ok: true, value: NEW_FOLDER },
    removeFolder: { ok: true, value: null },
  };

  answer<M extends LibraryMethod>(method: M, result: Answers[M]): this {
    this.answers[method] = result as (typeof this.answers)[M];
    return this;
  }

  /** Keeps the next calls of `method` waiting; call the returned function to answer them. */
  hold<M extends LibraryMethod>(method: M): (result: Answers[M]) => void {
    let resolve: (value: Answers[M]) => void = () => undefined;
    const promise = new Promise<Answers[M]>((settle) => {
      resolve = settle;
    });
    this.answers[method] = { promise, resolve } as (typeof this.answers)[M];
    return resolve;
  }

  /** The arguments after the campaign id of each call of `method`. */
  callsOf(method: LibraryMethod): unknown[][] {
    return this.calls
      .filter((call) => call.method === method)
      .map((call) => [...call.args.slice(1)]);
  }

  list(campaignId: string): Promise<Answers['list']> {
    return this.reply('list', [campaignId]);
  }

  createScene(
    campaignId: string,
    input: CreateLibrarySceneRequestDto,
  ): Promise<Answers['createScene']> {
    return this.reply('createScene', [campaignId, input]);
  }

  updateScene(
    campaignId: string,
    sceneId: string,
    changes: UpdateLibrarySceneRequestDto,
  ): Promise<Answers['updateScene']> {
    return this.reply('updateScene', [campaignId, sceneId, changes]);
  }

  duplicateScene(campaignId: string, sceneId: string): Promise<Answers['duplicateScene']> {
    return this.reply('duplicateScene', [campaignId, sceneId]);
  }

  removeScene(campaignId: string, sceneId: string): Promise<Answers['removeScene']> {
    return this.reply('removeScene', [campaignId, sceneId]);
  }

  createFolder(
    campaignId: string,
    input: CreateSceneFolderRequestDto,
  ): Promise<Answers['createFolder']> {
    return this.reply('createFolder', [campaignId, input]);
  }

  updateFolder(
    campaignId: string,
    folderId: string,
    changes: UpdateSceneFolderRequestDto,
  ): Promise<Answers['updateFolder']> {
    return this.reply('updateFolder', [campaignId, folderId, changes]);
  }

  removeFolder(campaignId: string, folderId: string): Promise<Answers['removeFolder']> {
    return this.reply('removeFolder', [campaignId, folderId]);
  }

  createImage(
    campaignId: string,
    input: CreateLibraryImageRequestDto,
  ): Promise<Answers['createImage']> {
    return this.reply('createImage', [campaignId, input]);
  }
  updateImage(
    campaignId: string,
    imageId: string,
    changes: UpdateLibraryImageRequestDto,
  ): Promise<Answers['updateImage']> {
    return this.reply('updateImage', [campaignId, imageId, changes]);
  }
  removeImage(campaignId: string, imageId: string): Promise<Answers['removeImage']> {
    return this.reply('removeImage', [campaignId, imageId]);
  }

  private async reply<M extends LibraryMethod>(
    method: M,
    args: readonly unknown[],
  ): Promise<Answers[M]> {
    this.calls.push({ method, args });
    const answer: Answers[M] | Pending<Answers[M]> = this.answers[method];
    return 'promise' in answer ? answer.promise : answer;
  }
}
