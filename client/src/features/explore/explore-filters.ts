import type { CampaignStatusDto, PublicCampaignDto } from '@lorkarium/contracts';
import { searchText } from '@/lib/search-text';

export type ExploreVisibilityFilter = 'all' | 'public' | 'private';

/** What "Pesquisar" applies: the text and the filters chosen in the panel beside it. */
export type ExploreSearch = Readonly<{
  /** A piece of the campaign name, or the master's @ written in full. */
  query: string;
  status: CampaignStatusDto | 'all';
  masterOnline: boolean;
  playersOnline: boolean;
  /** Only an admin sees private campaigns, so only an admin gets this choice. */
  visibility: ExploreVisibilityFilter;
}>;

export const EMPTY_EXPLORE_SEARCH: ExploreSearch = {
  query: '',
  status: 'all',
  masterOnline: false,
  playersOnline: false,
  visibility: 'all',
};

/** How many cards one page of "Explorar mesas" shows: three rows of the widest grid. */
export const EXPLORE_PAGE_SIZE = 12;

/** The campaigns the search finds; the online filters read the presence the list carries.
 *
 *  Example: `applyExploreSearch(campaigns, { ...EMPTY_EXPLORE_SEARCH, query: '@bia' })` */
export function applyExploreSearch<T extends PublicCampaignDto>(
  campaigns: readonly T[],
  search: ExploreSearch,
): T[] {
  return campaigns.filter(
    (campaign) => matchesExploreQuery(campaign, search.query) && passesFilters(campaign, search),
  );
}

// The name matches by a piece of it; the @ only in full, so a search never lists people by guess.
function matchesExploreQuery(campaign: PublicCampaignDto, query: string): boolean {
  const needle = query.trim();
  if (!needle) return true;
  const username = needle.replace(/^@/, '').toLowerCase();
  if (campaign.masterUsername.toLowerCase() === username) return true;
  return searchText(campaign.name).includes(searchText(needle));
}

function passesFilters(campaign: PublicCampaignDto, search: ExploreSearch): boolean {
  if (search.status !== 'all' && campaign.status !== search.status) return false;
  if (search.masterOnline && !campaign.masterOnline) return false;
  if (search.playersOnline && campaign.playersOnline === 0) return false;
  return search.visibility === 'all' || campaign.visibility === search.visibility;
}

/** How many of the panel's filters differ from "everything", for the badge on "Filtros".
 *
 *  Example: `activeFilterCount({ ...EMPTY_EXPLORE_SEARCH, masterOnline: true }) // 1` */
export function activeFilterCount(search: ExploreSearch): number {
  return [
    search.status !== 'all',
    search.masterOnline,
    search.playersOnline,
    search.visibility !== 'all',
  ].filter(Boolean).length;
}

/** How many pages a list of `count` cards takes; never less than one (the empty page).
 *
 *  Example: `explorePageCount(25) // 3` */
export function explorePageCount(count: number): number {
  return Math.max(1, Math.ceil(count / EXPLORE_PAGE_SIZE));
}

/** The cards of the 1-based `page`, clamped to the last page when the list shrank under it.
 *
 *  Example: `explorePage(campaigns, 2)` // the 13th to the 24th */
export function explorePage<T>(items: readonly T[], page: number): T[] {
  const last = explorePageCount(items.length);
  const start = (Math.min(Math.max(page, 1), last) - 1) * EXPLORE_PAGE_SIZE;
  return items.slice(start, start + EXPLORE_PAGE_SIZE);
}
