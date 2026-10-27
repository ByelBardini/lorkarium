import type { PublicCampaignDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { useLoaderData } from 'react-router';
import { CampaignListHeader } from '@/components/campaign-list-header';
import { LoadErrorScreen } from '@/components/load-error-screen';
import { filterCampaigns } from '@/lib/campaign-list';
import { PublicCampaignRow } from './public-campaign-row';

/** The page of the explore route, over what its loader read.
 *
 *  Example: `{ path: 'campaigns/public', Component: ExploreRoute }` */
export function ExploreRoute(): React.JSX.Element {
  const { campaigns } = useLoaderData<Readonly<{ campaigns: PublicCampaignDto[] }>>();
  return <ExplorePage campaigns={campaigns} />;
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

export type ExplorePageProps = Readonly<{ campaigns: readonly PublicCampaignDto[] }>;

/** "Explorar mesas": the public campaigns, searchable by name or system, each with "Entrar" (or
 *  "Abrir" for one the reader is already in).
 *
 *  Example: `<ExplorePage campaigns={campaigns} />` */
export function ExplorePage({ campaigns }: ExplorePageProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const visible = filterCampaigns(campaigns, query);
  return (
    <div className="flex w-full flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
      <title>Lorkarium · Explorar mesas</title>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[34px] leading-tight font-semibold">Explorar mesas</h1>
        <p className="max-w-prose text-muted-foreground">
          As mesas que os mestres deixaram públicas. Quem entra assiste até o mestre te chamar para
          jogar.
        </p>
      </header>
      <section aria-labelledby="public-list-title" className="flex flex-col gap-2">
        <CampaignListHeader
          titleId="public-list-title"
          title="Mesas públicas"
          count={visible.length}
          query={query}
          onQuery={setQuery}
          searchLabel="Buscar mesa pública"
        />
        <PublicList campaigns={visible} query={query} empty={campaigns.length === 0} />
      </section>
    </div>
  );
}

type PublicListProps = Readonly<{
  campaigns: readonly PublicCampaignDto[];
  query: string;
  empty: boolean;
}>;

function PublicList({ campaigns, query, empty }: PublicListProps): React.JSX.Element {
  if (empty) {
    return <p className="py-6 text-sm text-muted-foreground">Nenhuma mesa pública por enquanto.</p>;
  }
  if (campaigns.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Nenhuma mesa pública com “{query.trim()}”.
      </p>
    );
  }
  return (
    <ul>
      {campaigns.map((campaign) => (
        <PublicCampaignRow key={campaign.id} campaign={campaign} />
      ))}
    </ul>
  );
}
