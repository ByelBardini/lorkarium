import type { MapAppearancesResponseDto } from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { viewerAccessOf } from '../campaigns/member-access';
import { DocumentAccessBo } from '../documents/document-access.bo';
import { DocumentNotFoundError } from '../documents/documents.error';
import type { LibraryRequester } from '../library/library.service';
import { LibraryMapAccessBo } from './library-map-access.bo';
import type { LibraryMapDaos, LibraryMapServiceDeps } from './library-maps.service';
import { toMapAppearanceDto } from './library-maps.mapper';

/** "Aparece em": the places on the maps where a document is linked, for whoever reads that
 *  document, and only the places this reader may see.
 *
 *  Example: `(await new MapAppearancesService(deps).list(requester, documentId)).appearances` */
export class MapAppearancesService {
  constructor(private readonly deps: Pick<LibraryMapServiceDeps, 'snapshot'>) {}

  /** A document the reader may not read is DOCUMENT_NOT_FOUND, like one that does not exist.
   *
   *  Example: `await appearances.list(requester, documentId)` */
  async list(requester: LibraryRequester, documentId: string): Promise<MapAppearancesResponseDto> {
    return this.deps.snapshot(async (daos) => {
      const { campaignId, userId } = requester;
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      await this.requireReadable(daos, access, documentId);
      const rows = await daos.regions.listAppearances(campaignId, documentId);
      const maps = new LibraryMapAccessBo(access);
      const seen = rows.filter((row) =>
        maps.canSeeRegion(
          {
            visibility: row.mapVisibility,
            isMain: row.mapIsMain,
            hiddenByFolder: row.mapHiddenByFolder,
          },
          { hidden: row.regionHidden },
        ),
      );
      return { appearances: seen.map(toMapAppearanceDto) };
    });
  }

  private async requireReadable(
    daos: LibraryMapDaos,
    access: CampaignAccessBo,
    documentId: string,
  ): Promise<void> {
    const campaignId = access.campaignIdOf();
    const document = await daos.documents.findInCampaign(campaignId, documentId);
    if (!document) throw new DocumentNotFoundError(campaignId, documentId);
    const ownerIds = await daos.documents.owners(campaignId, documentId);
    new DocumentAccessBo(access, { ...document, ownerIds }).requireRead();
  }
}
