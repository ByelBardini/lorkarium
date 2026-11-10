import type {
  CampaignDetailDto,
  CampaignLibraryDto,
  MapRegionDto,
  MapRegionLinkDto,
} from '@lorkarium/contracts';
import { useRef, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { AppDependencies } from '@/app/router';
import type { ImageView } from '@/features/library/image-viewer';
import type { MapTravelOutcome, MapViewState } from '@/stores/map-view-store';

type OpenLink = Extract<NonNullable<MapRegionLinkDto>, { state: 'open' }>;

export type MapRegionOpening = Readonly<{
  /** Opens what the region links to; a region with no open link opens nothing. */
  openRegion: (region: MapRegionDto) => void;
  /** Says the outcome of a move along the trail, when it is one to warn about. */
  reportTravel: (outcome: MapTravelOutcome, label: string) => void;
  /** The image of a link, for the viewer. */
  image: ImageView | null;
  closeImage: () => void;
  /** Why the last attempt opened nothing. */
  problem: string | null;
  dismissProblem: () => void;
}>;

type OpenContext = Readonly<{
  deps: AppDependencies;
  campaign: CampaignDetailDto;
  view: StoreApi<MapViewState>;
}>;

/** What a resolved target does: `null` if it is gone from what this reader may see. */
type LinkOpening = (() => void) | null;

const COULD_NOT_OPEN = 'Não deu para abrir agora. Tente de novo.';

/** Opens the items linked by a map's regions. Each target is looked up again first, in what the
 *  reader may see right now: a link read a while ago may point at something revoked since. A grid
 *  opens as a personal tab and never moves the group; a map, in this same tab, along the trail.
 *
 *  Example: `const opening = useMapRegionOpen({ deps, campaign, view })` */
export function useMapRegionOpen(context: OpenContext): MapRegionOpening {
  const [image, setImage] = useState<ImageView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const lastAttempt = useRef(0);
  const reportTravel = (outcome: MapTravelOutcome, label: string): void =>
    setProblem(travelProblem(outcome, label));
  const follow = async (link: OpenLink, label: string): Promise<void> => {
    if (link.kind === 'map')
      return reportTravel(await context.view.getState().enter(link.id), label);
    const attempt = ++lastAttempt.current;
    const isLatest = (): boolean => attempt === lastAttempt.current;
    setProblem(null);
    await openFromLibrary(link, label, context, {
      isLatest,
      showImage: setImage,
      warn: setProblem,
    });
  };
  return {
    openRegion: (region) => {
      if (region.link?.state === 'open') void follow(region.link, region.name);
    },
    reportTravel,
    image,
    closeImage: () => setImage(null),
    problem,
    dismissProblem: () => setProblem(null),
  };
}

type OpenAnswers = Readonly<{
  /** A newer attempt makes this one's answer moot. */
  isLatest: () => boolean;
  showImage: (image: ImageView) => void;
  warn: (problem: string) => void;
}>;

async function openFromLibrary(
  link: OpenLink,
  label: string,
  context: OpenContext,
  answers: OpenAnswers,
): Promise<void> {
  const library = await context.deps.libraryApi.list(context.campaign.id);
  if (!answers.isLatest()) return;
  if (!library.ok) return answers.warn(COULD_NOT_OPEN);
  const opening = openingOf(link, library.value, context, answers.showImage);
  if (opening) return opening();
  answers.warn(revokedMessage(label));
  // What the map said about that item changed too: a link now locked must read as locked.
  void context.view.getState().load();
}

function travelProblem(outcome: MapTravelOutcome, label: string): string | null {
  if (outcome === 'not_found') return revokedMessage(label);
  return outcome === 'failed' ? COULD_NOT_OPEN : null;
}

// Names the region and never the item: the reader may have lost the right to know it.
function revokedMessage(label: string): string {
  return `Não dá mais para abrir o que está em ${label}.`;
}

function openingOf(
  link: OpenLink,
  library: CampaignLibraryDto,
  context: OpenContext,
  showImage: (image: ImageView) => void,
): LinkOpening {
  if (link.kind === 'document') return documentOpening(link, library, context);
  if (link.kind === 'scene') return gridOpening(link.id, library, context);
  const image = library.images.find(({ id }) => id === link.id);
  return image ? () => showImage(image) : null;
}

function documentOpening(
  { id: documentId, tabId }: OpenLink,
  library: CampaignLibraryDto,
  { deps, campaign }: OpenContext,
): LinkOpening {
  const document = library.documents.find(({ id }) => id === documentId);
  if (!document) return null;
  return () => void deps.documentWorkspace.getState().open({ campaign, document, tabId });
}

function gridOpening(
  sceneId: string,
  library: CampaignLibraryDto,
  { deps, campaign }: OpenContext,
): LinkOpening {
  const table = deps.openTables.getState().tables.find((open) => open.campaignId === campaign.id);
  if (!table || !library.scenes.some(({ id }) => id === sceneId)) return null;
  return () => {
    deps.documentWorkspace.getState().activate(campaign.id, null);
    table.tabs.getState().open(sceneId);
  };
}
