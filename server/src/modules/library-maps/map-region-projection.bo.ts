import type { MapPinIconDto } from '@lorkarium/contracts';
import type { MapRegionGeometry } from '@lorkarium/game-core';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { DocumentAccessBo, type DocumentAccessState } from '../documents/document-access.bo';
import { canReadLibraryImage } from '../library/library-image.bo';
import { SceneAccessBo, type GridReach } from '../scenes/scene-access.bo';
import { LibraryMapAccessBo, type LibraryMapExposure } from './library-map-access.bo';

export type MapLinkKind = 'document' | 'scene' | 'map' | 'image';

export type MapRegionLinkColumns = Readonly<{
  linkKind: MapLinkKind | null;
  targetDocumentId: string | null;
  targetSceneId: string | null;
  targetMapId: string | null;
  targetImageId: string | null;
}>;

export type MapRegionFacts = MapRegionLinkColumns &
  Readonly<{
    id: string;
    name: string;
    description: string;
    geometry: MapRegionGeometry;
    color: string;
    icon: MapPinIconDto;
    hidden: boolean;
  }>;

type NamedTarget = Readonly<{ name: string }>;
export type DocumentLinkTarget = DocumentAccessState & NamedTarget;
export type SceneLinkTarget = GridReach & NamedTarget;
export type MapLinkTarget = LibraryMapExposure & NamedTarget;
export type ImageLinkTarget = NamedTarget &
  Readonly<{ visibility: 'private' | 'public'; isPresented: boolean; hiddenByFolder: boolean }>;

/** What the reader's links point at, by id. `groupSceneId` is the table's active grid. */
export type MapLinkTargets = Readonly<{
  groupSceneId: string | null;
  documents: ReadonlyMap<string, DocumentLinkTarget>;
  scenes: ReadonlyMap<string, SceneLinkTarget>;
  maps: ReadonlyMap<string, MapLinkTarget>;
  images: ReadonlyMap<string, ImageLinkTarget>;
}>;

export type MapLinkTargetIds = Readonly<{
  documents: readonly string[];
  scenes: readonly string[];
  maps: readonly string[];
  images: readonly string[];
}>;

export type ProjectedMapLink =
  | null
  | Readonly<{ state: 'open'; kind: MapLinkKind; id: string; name: string }>
  | Readonly<{ state: 'locked' }>
  | Readonly<{ state: 'removed'; kind: MapLinkKind }>;

export type ProjectedMapRegion = Readonly<{ region: MapRegionFacts; link: ProjectedMapLink }>;

function distinctIds(ids: readonly (string | null)[]): string[] {
  return [...new Set(ids.filter((id) => id !== null))];
}

/** The items the regions point at, by kind and without repeats, so that each kind costs one query
 *  and not one per region.
 *
 *  Example: `mapLinkTargetIdsOf(regions).documents // [diarioId]` */
export function mapLinkTargetIdsOf(regions: readonly MapRegionLinkColumns[]): MapLinkTargetIds {
  return {
    documents: distinctIds(regions.map(({ targetDocumentId }) => targetDocumentId)),
    scenes: distinctIds(regions.map(({ targetSceneId }) => targetSceneId)),
    maps: distinctIds(regions.map(({ targetMapId }) => targetMapId)),
    images: distinctIds(regions.map(({ targetImageId }) => targetImageId)),
  };
}

function targetIdOf(region: MapRegionLinkColumns, kind: MapLinkKind): string | null {
  const byKind: Readonly<Record<MapLinkKind, string | null>> = {
    document: region.targetDocumentId,
    scene: region.targetSceneId,
    map: region.targetMapId,
    image: region.targetImageId,
  };
  return byKind[kind];
}

/** What each reader may know of the regions of a map they already see. A hidden region only
 *  reaches a master. A link names its item only to whoever may open it; for anyone else the item
 *  is `locked`, with no id, name or kind. Each kind asks the rule that already guards that item.
 *
 *  Example: `new MapRegionProjectionBo(access, targets).project(regions)` */
export class MapRegionProjectionBo {
  constructor(
    private readonly access: CampaignAccessBo,
    private readonly targets: MapLinkTargets,
  ) {}

  /** The regions this reader gets, in the order received. Someone who is not a member gets
   *  CAMPAIGN_NOT_FOUND.
   *
   *  Example: `projection.project(regions)[0]?.link // { state: 'locked' }` */
  project(regions: readonly MapRegionFacts[]): ProjectedMapRegion[] {
    const readable = this.access.isMaster() ? regions : regions.filter(({ hidden }) => !hidden);
    return readable.map((region) => ({ region, link: this.linkOf(region) }));
  }

  private linkOf(region: MapRegionFacts): ProjectedMapLink {
    const kind = region.linkKind;
    if (kind === null) return null;
    const id = targetIdOf(region, kind);
    if (id === null) return this.access.isMaster() ? { state: 'removed', kind } : null;
    const name = this.openableName(kind, id);
    return name === undefined ? { state: 'locked' } : { state: 'open', kind, id, name };
  }

  private openableName(kind: MapLinkKind, id: string): string | undefined {
    if (kind === 'document') return this.documentName(id);
    if (kind === 'scene') return this.sceneName(id);
    return kind === 'map' ? this.mapName(id) : this.imageName(id);
  }

  private documentName(id: string): string | undefined {
    const target = this.targets.documents.get(id);
    return target && new DocumentAccessBo(this.access, target).canRead() ? target.name : undefined;
  }

  private sceneName(id: string): string | undefined {
    const target = this.targets.scenes.get(id);
    const grids = new SceneAccessBo(this.access, this.targets.groupSceneId);
    return target && grids.canSee(target) ? target.name : undefined;
  }

  private mapName(id: string): string | undefined {
    const target = this.targets.maps.get(id);
    return target && new LibraryMapAccessBo(this.access).canSee(target) ? target.name : undefined;
  }

  private imageName(id: string): string | undefined {
    const target = this.targets.images.get(id);
    if (!target) return undefined;
    const { visibility, isPresented, hiddenByFolder } = target;
    const isMaster = this.access.isMaster();
    const canOpen = canReadLibraryImage(isMaster, visibility, isPresented, hiddenByFolder);
    return canOpen ? target.name : undefined;
  }
}
