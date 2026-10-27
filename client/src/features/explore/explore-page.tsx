import type { PublicCampaignDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { Outlet, useLoaderData } from 'react-router';
import { LoadErrorScreen } from '@/components/load-error-screen';
import {
  applyExploreSearch,
  EMPTY_EXPLORE_SEARCH,
  explorePage,
  explorePageCount,
  type ExploreSearch,
} from './explore-filters';
import { ExplorePagination } from './explore-pagination';
import type { ExploreLoaderData } from './explore-route';
import { ExploreSearchForm } from './explore-search-form';
import { PublicCampaignRow } from './public-campaign-row';

/** The page of the explore route, over what its loader read.
 *
 *  Example: `{ path: 'campaigns/public', Component: ExploreRoute }` */
export function ExploreRoute(): React.JSX.Element {
  const { campaigns, readerId, readerIsAdmin } = useLoaderData<ExploreLoaderData>();
  return <ExplorePage campaigns={campaigns} readerId={readerId} readerIsAdmin={readerIsAdmin} />;
}

/** The explore route when its list could not load: what happened and "Tentar de novo".
 *
 *  Example: `{ path: 'campaigns/public', ErrorBoundary: ExploreErrorScreen }` */
export function ExploreErrorScreen(): React.JSX.Element {
  return (
    <LoadErrorScreen
      pageTitle="Lorkarium · Explorar mesas"
      failedHeading="Não deu para carregar as mesas públicas."
    />
  );
}

export type ExplorePageProps = Readonly<{
  campaigns: readonly PublicCampaignDto[];
  readerId: string | null;
  /** Shows the "Visibilidade" filter: only an admin is sent private campaigns. */
  readerIsAdmin: boolean;
}>;

/** "Explorar mesas": the public campaigns, every one until a search ("Pesquisar") narrows them
 *  by name or the master's exact @ and the panel's filters; twelve to a page.
 *
 *  Example: `<ExplorePage campaigns={campaigns} readerId={user.id} readerIsAdmin={false} />` */
export function ExplorePage({
  campaigns,
  readerId,
  readerIsAdmin,
}: ExplorePageProps): React.JSX.Element {
  const [search, setSearch] = useState<ExploreSearch>(EMPTY_EXPLORE_SEARCH);
  const [page, setPage] = useState(1);
  const found = applyExploreSearch(campaigns, search);
  const pageCount = explorePageCount(found.length);
  const shownPage = Math.min(page, pageCount);
  const onSearch = (next: ExploreSearch): void => {
    setSearch(next);
    setPage(1);
  };
  return (
    <section
      aria-labelledby="explore-title"
      className="flex w-full flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10 lg:px-12"
    >
      <title>Lorkarium · Explorar mesas</title>
      <div className="flex items-baseline gap-3">
        <h1 id="explore-title" className="font-display text-[34px] leading-tight font-semibold">
          Explorar mesas
        </h1>
        <span className="text-sm text-muted-foreground">{foundLabel(found.length)}</span>
      </div>
      <ExploreSearchForm applied={search} onSearch={onSearch} readerIsAdmin={readerIsAdmin} />
      <PublicList
        campaigns={explorePage(found, shownPage)}
        query={search.query}
        empty={campaigns.length === 0}
        readerId={readerId}
        readerIsAdmin={readerIsAdmin}
      />
      <ExplorePagination page={shownPage} pageCount={pageCount} onPage={setPage} />
      <Outlet />
    </section>
  );
}

function foundLabel(count: number): string {
  return count === 1 ? '1 mesa' : `${count} mesas`;
}

type PublicListProps = Readonly<{
  campaigns: readonly PublicCampaignDto[];
  query: string;
  empty: boolean;
  readerId: string | null;
  readerIsAdmin: boolean;
}>;

function PublicList({ campaigns, query, empty, ...reader }: PublicListProps): React.JSX.Element {
  if (empty) {
    return <p className="py-6 text-sm text-muted-foreground">Nenhuma mesa pública por enquanto.</p>;
  }
  if (campaigns.length === 0) {
    const words = query.trim()
      ? `Nenhuma mesa pública com “${query.trim()}”.`
      : 'Nenhuma mesa pública com esses filtros.';
    return <p className="py-6 text-sm text-muted-foreground">{words}</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {campaigns.map((campaign) => (
        <PublicCampaignRow key={campaign.id} campaign={campaign} {...reader} />
      ))}
    </ul>
  );
}
