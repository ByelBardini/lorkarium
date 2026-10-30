import type { LibraryChangedDto, SceneActivatedDto } from '@lorkarium/contracts';
import type { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import type { CampaignPo } from '../../src/modules/campaigns/campaigns.po';
import type { LibraryPublisherPort } from '../../src/modules/library/library-publisher.port';
import type {
  LibraryTransactionRunner,
  LibraryWriteDaos,
} from '../../src/modules/library/library.service';
import type { SceneFoldersDao } from '../../src/modules/library/scene-folders.dao';
import type {
  NewSceneFolderPo,
  SceneFolderChangesPo,
  SceneFolderPo,
} from '../../src/modules/library/scene-folders.po';
import type { SceneTransaction } from '../../src/modules/scenes/locked-scene';
import type { SceneActivationDaos } from '../../src/modules/scenes/scene-activation.service';
import type {
  GridEviction,
  SceneAudiencePort,
  TableMove,
} from '../../src/modules/scenes/scene-audience.port';
import type { LibrarySceneRow, ScenesDao } from '../../src/modules/scenes/scenes.dao';
import type {
  NewScenePo,
  SceneLibraryChangesPo,
  ScenePo,
} from '../../src/modules/scenes/scenes.po';
import { librarySceneRow, sceneFolderPo } from './library-factories';

/** In-memory campaigns for the library; `lockById` writes 'lock' and `setActiveScene`
 *  'setActiveScene' to the journal. */
export class LibraryCampaignsDaoFake implements Pick<
  CampaignsDao,
  'findById' | 'lockById' | 'setActiveScene'
> {
  constructor(
    private readonly journal: string[],
    readonly rows: CampaignPo[] = [],
  ) {}

  async findById(campaignId: string): Promise<CampaignPo | undefined> {
    return this.rows.find((row) => row.id === campaignId);
  }

  async lockById(campaignId: string): Promise<CampaignPo | undefined> {
    this.journal.push('lock');
    return this.findById(campaignId);
  }

  async setActiveScene(campaignId: string, sceneId: string): Promise<void> {
    this.journal.push('setActiveScene');
    const row = await this.findById(campaignId);
    if (row) row.activeSceneId = sceneId;
  }
}

/** In-memory scene_folders of every campaign; each write records its name in the journal. */
export class SceneFoldersDaoFake implements Pick<
  SceneFoldersDao,
  'listOfCampaign' | 'insert' | 'update' | 'moveChildren' | 'delete'
> {
  constructor(
    private readonly journal: string[],
    readonly rows: SceneFolderPo[] = [],
  ) {}

  async listOfCampaign(campaignId: string): Promise<SceneFolderPo[]> {
    return this.rows.filter((row) => row.campaignId === campaignId);
  }

  async insert(folder: NewSceneFolderPo): Promise<SceneFolderPo> {
    this.journal.push('insert');
    const id = `0f0f0f0f-0f0f-4f0f-8f0f-${String(this.rows.length + 1).padStart(12, '0')}`;
    const row = sceneFolderPo({ id, parentId: null, ...folder });
    this.rows.push(row);
    return row;
  }

  async update(
    campaignId: string,
    folderId: string,
    changes: SceneFolderChangesPo,
  ): Promise<SceneFolderPo | undefined> {
    this.journal.push('update');
    const row = this.rows.find((each) => each.campaignId === campaignId && each.id === folderId);
    return row && Object.assign(row, changes);
  }

  async moveChildren(
    campaignId: string,
    folderIds: readonly string[],
    parentId: string | null,
  ): Promise<void> {
    this.journal.push('moveChildren');
    for (const row of this.rows) {
      if (row.campaignId === campaignId && folderIds.includes(row.id)) row.parentId = parentId;
    }
  }

  async delete(campaignId: string, folderId: string): Promise<boolean> {
    this.journal.push('delete');
    const index = this.rows.findIndex(
      (row) => row.campaignId === campaignId && row.id === folderId,
    );
    if (index >= 0) this.rows.splice(index, 1);
    return index >= 0;
  }
}

/** In-memory scenes as the library sees them; every write records 'save' in the journal. */
export class LibraryScenesDaoFake implements Pick<
  ScenesDao,
  | 'listOfCampaign'
  | 'insert'
  | 'findInCampaign'
  | 'findLibraryRow'
  | 'updateLibrary'
  | 'bumpVersion'
  | 'moveScenes'
  | 'delete'
> {
  constructor(
    private readonly journal: string[],
    readonly rows: LibrarySceneRow[] = [],
  ) {}

  async listOfCampaign(campaignId: string): Promise<LibrarySceneRow[]> {
    return this.rows.filter((row) => row.campaignId === campaignId);
  }

  async insert(scene: NewScenePo): Promise<ScenePo> {
    this.journal.push('save');
    const id = `0e0e0e0e-0e0e-4e0e-8e0e-${String(this.rows.length + 1).padStart(12, '0')}`;
    const row = librarySceneRow({ id, visibility: 'private', folderId: null, ...scene });
    this.rows.push(row);
    return row;
  }

  async findInCampaign(campaignId: string, sceneId: string): Promise<LibrarySceneRow | undefined> {
    return this.findLibraryRow(campaignId, sceneId);
  }

  async findLibraryRow(campaignId: string, sceneId: string): Promise<LibrarySceneRow | undefined> {
    return this.rows.find((row) => row.campaignId === campaignId && row.id === sceneId);
  }

  async updateLibrary(
    campaignId: string,
    sceneId: string,
    changes: SceneLibraryChangesPo,
  ): Promise<ScenePo | undefined> {
    this.journal.push('save');
    const row = await this.findLibraryRow(campaignId, sceneId);
    return row && Object.assign(row, changes);
  }

  async bumpVersion(sceneId: string): Promise<number> {
    this.journal.push('bump');
    const row = this.rows.find((candidate) => candidate.id === sceneId);
    if (!row) throw new Error(`LibraryScenesDaoFake has no scene ${sceneId}`);
    row.version += 1;
    return row.version;
  }

  async moveScenes(
    campaignId: string,
    sceneIds: readonly string[],
    folderId: string | null,
  ): Promise<void> {
    this.journal.push('moveScenes');
    for (const row of this.rows) {
      if (row.campaignId === campaignId && sceneIds.includes(row.id)) row.folderId = folderId;
    }
  }

  async delete(campaignId: string, sceneId: string): Promise<boolean> {
    this.journal.push('save');
    const index = this.rows.findIndex((row) => row.campaignId === campaignId && row.id === sceneId);
    if (index >= 0) this.rows.splice(index, 1);
    return index >= 0;
  }
}

/** Records every `library:changed` ('publish' in the shared journal) and `scene:activated`
 *  ('publish activated'), to prove the order. */
export class LibraryPublisherFake implements LibraryPublisherPort {
  imagePresentationChanged(): void {}
  readonly changes: LibraryChangedDto[] = [];
  readonly activations: SceneActivatedDto[] = [];

  constructor(private readonly journal: string[]) {}

  libraryChanged(event: LibraryChangedDto): void {
    this.journal.push('publish');
    this.changes.push(event);
  }

  sceneActivated(event: SceneActivatedDto): void {
    this.journal.push('publish activated');
    this.activations.push(event);
  }
}

/** Runs the work on the fakes and writes 'commit' once it resolved, like the real transaction;
 *  a work that throws writes nothing. */
export class LibraryTransactionRunnerFake {
  constructor(
    private readonly journal: string[],
    private readonly daos: LibraryWriteDaos,
  ) {}

  readonly run: LibraryTransactionRunner = async (work) => {
    const result = await work(this.daos);
    this.journal.push('commit');
    return result;
  };
}

/** What a duplicate copies of one table: records `copy <what> <from> → <to>` in the journal. */
export class SceneCopyDaoFake {
  constructor(
    private readonly journal: string[],
    private readonly what: string,
  ) {}

  async copyScene(fromSceneId: string, toSceneId: string): Promise<void> {
    this.journal.push(`copy ${this.what} ${fromSceneId} → ${toSceneId}`);
  }
}

/** The token copier also answers the map of ids (empty here: the service does not use it). */
export class TokenCopyDaoFake {
  private readonly copier: SceneCopyDaoFake;

  constructor(journal: string[]) {
    this.copier = new SceneCopyDaoFake(journal, 'tokens');
  }

  async copyScene(fromSceneId: string, toSceneId: string): Promise<ReadonlyMap<string, string>> {
    await this.copier.copyScene(fromSceneId, toSceneId);
    return new Map();
  }
}

/** The five copiers of a duplicate, all writing to `journal`. */
export function sceneCopyDaoFakes(journal: string[]) {
  return {
    tokens: new TokenCopyDaoFake(journal),
    walls: new SceneCopyDaoFake(journal, 'walls'),
    lights: new SceneCopyDaoFake(journal, 'lights'),
    drawings: new SceneCopyDaoFake(journal, 'drawings'),
    effectAreas: new SceneCopyDaoFake(journal, 'areas'),
  } as const;
}

/** Records each move of a table ('move audience') and each eviction ('evict <audience>'). */
export class SceneAudienceFake implements SceneAudiencePort {
  readonly moves: TableMove[] = [];
  readonly evictions: GridEviction[] = [];

  constructor(private readonly journal: string[]) {}

  async moveTable(move: TableMove): Promise<void> {
    this.journal.push('move audience');
    this.moves.push(move);
  }

  async evict(eviction: GridEviction): Promise<void> {
    this.journal.push(`evict ${eviction.audience}`);
    this.evictions.push(eviction);
  }
}

/** The activation transaction over the fakes: 'commit' once the work resolved, nothing if it
 *  throws. */
export class SceneActivationRunnerFake {
  constructor(
    private readonly journal: string[],
    private readonly daos: SceneActivationDaos,
  ) {}

  readonly run: SceneTransaction<SceneActivationDaos> = async (work) => {
    const result = await work(this.daos);
    this.journal.push('commit');
    return result;
  };
}
