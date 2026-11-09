import type { CampaignDetailDto, MapAppearanceDto } from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { openMapAtRegion } from '@/features/maps/open-map-at-region';
import type { LibraryMapsApi, LibraryMapsResult } from '@/services/library-maps-api';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';

export type DocumentMapAppearancesProps = Readonly<{
  campaign: CampaignDetailDto;
  documentId: string;
  reader: Pick<LibraryMapsApi, 'appearances'>;
  workspace: StoreApi<DocumentWorkspaceStore>;
  /** Changes whenever what this reader may see of the maps can have: the list is read again. */
  readVersion: string;
}>;

/** The "Aparece em" line of a document: the places on the maps that lead to it, each one opening
 *  its map on that place. No line without a place.
 *
 *  Example: `<DocumentMapAppearances campaign={campaign} documentId={id} reader={api} workspace={workspace} readVersion="0" />` */
export function DocumentMapAppearances(
  props: DocumentMapAppearancesProps,
): React.JSX.Element | null {
  const { campaign, workspace } = props;
  const appearances = useMapAppearances(props);
  if (appearances.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Aparece em"
      className="flex max-h-16 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 overflow-y-auto border-b border-divider px-5 py-1.5 text-xs sm:px-8"
    >
      <span className="text-muted-foreground">Aparece em</span>
      {appearances.map(({ regionId, regionName, ...map }) => (
        <button
          key={regionId}
          type="button"
          onClick={() => openMapAtRegion(workspace, { campaign, ...map, regionId })}
          className="cursor-pointer rounded-sm text-primary outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {`${map.mapName} › ${regionName}`}
        </button>
      ))}
    </div>
  );
}

type AppearancesAnswer = LibraryMapsResult<readonly MapAppearanceDto[]>;

// Nothing here is worth an alert: a read that fails keeps what the line already said.
function useMapAppearances({
  campaign,
  documentId,
  reader,
  readVersion,
}: DocumentMapAppearancesProps): readonly MapAppearanceDto[] {
  const campaignId = campaign.id;
  const [appearances, setAppearances] = useState<readonly MapAppearanceDto[]>([]);
  useEffect(
    () => landUnlessStale(reader.appearances(campaignId, documentId), setAppearances),
    [reader, campaignId, documentId, readVersion],
  );
  return appearances;
}

function landUnlessStale(
  reading: Promise<AppearancesAnswer>,
  land: (appearances: readonly MapAppearanceDto[]) => void,
): () => void {
  let current = true;
  void reading.then((answer) => {
    if (current && answer.ok) land(answer.value);
  });
  return () => {
    current = false;
  };
}
