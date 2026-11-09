import { and, eq, inArray, sql } from 'drizzle-orm';
import { hiddenByFolderSql } from '../../database/hidden-by-folder-sql';
import type { DatabaseExecutor } from '../../database/transaction';
import { libraryDocumentOwners, libraryDocuments } from '../documents/documents.po';
import { libraryImagePresentations } from '../library/image-presentations.po';
import { libraryImages } from '../library/library-images.po';
import { scenes } from '../scenes/scenes.po';
import { libraryMaps } from './library-maps.po';
import type {
  DocumentLinkTarget,
  ImageLinkTarget,
  MapLinkTarget,
  SceneLinkTarget,
} from './map-region-projection.bo';

type WithId = Readonly<{ id: string }>;

/** What decides whether a reader may open the items the regions point at, one query per kind (a
 *  map holds up to 300 regions). Every query filters by the campaign of the session: an id of
 *  another table finds nothing. Receives the `db` or an open `tx`.
 *
 *  Example: `await new MapLinkTargetsDao(tx).documentsIn(campaignId, [diarioId])` */
export class MapLinkTargetsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Example: `await targets.documentsIn(campaignId, [diarioId])` */
  async documentsIn(campaignId: string, ids: readonly string[]): Promise<DocumentLinkTarget[]> {
    if (ids.length === 0) return [];
    const owners = libraryDocumentOwners;
    return this.db
      .select({
        id: libraryDocuments.id,
        name: libraryDocuments.name,
        visibility: libraryDocuments.visibility,
        hiddenByFolder: hiddenByFolderSql('"library_documents"."folder_id"'),
        version: libraryDocuments.version,
        ownerIds: sql<
          string[]
        >`coalesce(array_agg(${owners.userId}) filter (where ${owners.userId} is not null), '{}')`,
      })
      .from(libraryDocuments)
      .leftJoin(
        owners,
        and(
          eq(owners.campaignId, libraryDocuments.campaignId),
          eq(owners.documentId, libraryDocuments.id),
        ),
      )
      .where(
        and(eq(libraryDocuments.campaignId, campaignId), inArray(libraryDocuments.id, [...ids])),
      )
      .groupBy(libraryDocuments.id);
  }

  /** Example: `await targets.scenesIn(campaignId, [salaoId])` */
  async scenesIn(campaignId: string, ids: readonly string[]): Promise<SceneLinkTarget[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        id: scenes.id,
        name: scenes.name,
        visibility: scenes.visibility,
        hiddenByFolder: hiddenByFolderSql('"scenes"."folder_id"'),
      })
      .from(scenes)
      .where(and(eq(scenes.campaignId, campaignId), inArray(scenes.id, [...ids])));
  }

  /** Example: `await targets.mapsIn(campaignId, [masmorraId])` */
  async mapsIn(campaignId: string, ids: readonly string[]): Promise<(MapLinkTarget & WithId)[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        id: libraryMaps.id,
        name: libraryMaps.name,
        visibility: libraryMaps.visibility,
        isMain: libraryMaps.isMain,
        hiddenByFolder: hiddenByFolderSql('"library_maps"."folder_id"'),
      })
      .from(libraryMaps)
      .where(and(eq(libraryMaps.campaignId, campaignId), inArray(libraryMaps.id, [...ids])));
  }

  /** Example: `await targets.imagesIn(campaignId, [brasaoId])` */
  async imagesIn(
    campaignId: string,
    ids: readonly string[],
  ): Promise<(ImageLinkTarget & WithId)[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        id: libraryImages.id,
        name: libraryImages.name,
        visibility: libraryImages.visibility,
        hiddenByFolder: hiddenByFolderSql('"library_images"."folder_id"'),
        presentedImageId: libraryImagePresentations.imageId,
      })
      .from(libraryImages)
      .leftJoin(
        libraryImagePresentations,
        and(
          eq(libraryImagePresentations.campaignId, libraryImages.campaignId),
          eq(libraryImagePresentations.imageId, libraryImages.id),
        ),
      )
      .where(and(eq(libraryImages.campaignId, campaignId), inArray(libraryImages.id, [...ids])));
    return rows.map(({ presentedImageId, ...image }) => ({
      ...image,
      isPresented: presentedImageId !== null,
    }));
  }
}
