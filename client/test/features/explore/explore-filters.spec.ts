import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  applyExploreSearch,
  EMPTY_EXPLORE_SEARCH,
  EXPLORE_PAGE_SIZE,
  explorePage,
  explorePageCount,
} from '@/features/explore/explore-filters';
import { PUBLIC_VHARN } from '../../support/campaigns-api-fake';

const QUIET = { ...PUBLIC_VHARN, id: 'quiet', name: 'Ponte Antiga' };
const MASTER_THERE = {
  ...PUBLIC_VHARN,
  id: 'master',
  name: 'Pântano',
  masterUsername: 'caio',
  masterOnline: true,
  status: 'ongoing' as const,
};
const PLAYERS_THERE = {
  ...PUBLIC_VHARN,
  id: 'players',
  name: 'Cripta',
  playersOnline: 1,
  visibility: 'private' as const,
};
const ALL = [QUIET, MASTER_THERE, PLAYERS_THERE];

describe('applyExploreSearch', () => {
  it('an empty search keeps every campaign', () => {
    expect(applyExploreSearch(ALL, EMPTY_EXPLORE_SEARCH)).toEqual(ALL);
  });

  it('the text matches a piece of the name, ignoring accents and case', () => {
    expect(applyExploreSearch(ALL, { ...EMPTY_EXPLORE_SEARCH, query: 'PANTANO' })).toEqual([
      MASTER_THERE,
    ]);
  });

  it('the @ of the master matches only in full, with or without the @', () => {
    expect(applyExploreSearch(ALL, { ...EMPTY_EXPLORE_SEARCH, query: '@caio' })).toEqual([
      MASTER_THERE,
    ]);
    expect(applyExploreSearch(ALL, { ...EMPTY_EXPLORE_SEARCH, query: 'cai' })).toEqual([]);
  });

  it('a status keeps only that status', () => {
    expect(applyExploreSearch(ALL, { ...EMPTY_EXPLORE_SEARCH, status: 'ongoing' })).toEqual([
      MASTER_THERE,
    ]);
  });

  it('"Com mestre online" keeps the tables with the master there', () => {
    expect(applyExploreSearch(ALL, { ...EMPTY_EXPLORE_SEARCH, masterOnline: true })).toEqual([
      MASTER_THERE,
    ]);
  });

  it('"Com jogadores online" keeps the tables with someone besides the master', () => {
    expect(applyExploreSearch(ALL, { ...EMPTY_EXPLORE_SEARCH, playersOnline: true })).toEqual([
      PLAYERS_THERE,
    ]);
  });

  it('the visibility keeps public or private apart', () => {
    const onlyPublic = applyExploreSearch(ALL, { ...EMPTY_EXPLORE_SEARCH, visibility: 'public' });
    expect(onlyPublic).toEqual([QUIET, MASTER_THERE]);
  });
});

describe('activeFilterCount', () => {
  it('counts the filters that narrow, never the text', () => {
    expect(activeFilterCount({ ...EMPTY_EXPLORE_SEARCH, query: 'x' })).toBe(0);
    expect(
      activeFilterCount({ ...EMPTY_EXPLORE_SEARCH, status: 'finished', playersOnline: true }),
    ).toBe(2);
  });
});

describe('explorePage', () => {
  const items = Array.from({ length: EXPLORE_PAGE_SIZE + 1 }, (_, index) => index);

  it('counts at least one page, even for nothing', () => {
    expect(explorePageCount(0)).toBe(1);
    expect(explorePageCount(items.length)).toBe(2);
  });

  it('gives the cards of the page asked', () => {
    expect(explorePage(items, 2)).toEqual([EXPLORE_PAGE_SIZE]);
  });

  it('a page past the end falls back to the last one', () => {
    expect(explorePage(items, 9)).toEqual([EXPLORE_PAGE_SIZE]);
  });
});
