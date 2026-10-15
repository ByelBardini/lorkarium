import type { CampaignSummaryDto } from '@lorkarium/contracts';
import { SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { filterCampaigns } from '@/lib/campaign-list';
import { CampaignRow } from './campaign-row';
import { HomeActions, type HomeActionsProps } from './home-actions';

export type CampaignListProps = HomeActionsProps &
  Readonly<{ campaigns: readonly CampaignSummaryDto[] }>;

/** "Suas mesas": search over the loaded list and one row per campaign, or the empty invitation.
 *
 *  Example: `<CampaignList campaigns={campaigns} onCreate={openCreate} onJoin={openJoin} />` */
export function CampaignList({
  campaigns,
  onCreate,
  onJoin,
}: CampaignListProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  if (campaigns.length === 0) return <NoCampaigns onCreate={onCreate} onJoin={onJoin} />;
  const visible = filterCampaigns(campaigns, query);
  return (
    <section aria-labelledby="campaign-list-title" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-baseline gap-3">
          <h2 id="campaign-list-title" className="font-display text-[28px] font-semibold">
            Suas mesas
          </h2>
          <span className="text-sm text-muted-foreground">{countLabel(visible.length)}</span>
        </div>
        <SearchField query={query} onChange={setQuery} />
      </div>
      {visible.length > 0 ? (
        <ul>
          {visible.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-sm text-muted-foreground">
          Nenhuma mesa com “{query.trim()}”. Confere o nome ou entra com um código.
        </p>
      )}
    </section>
  );
}

function countLabel(count: number): string {
  return count === 1 ? '1 mesa' : `${count} mesas`;
}

type SearchFieldProps = Readonly<{ query: string; onChange: (query: string) => void }>;

function SearchField({ query, onChange }: SearchFieldProps): React.JSX.Element {
  return (
    <div className="relative w-full sm:w-72">
      <SearchIcon
        aria-hidden="true"
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-placeholder"
      />
      <Input
        type="search"
        aria-label="Buscar mesa"
        placeholder="Buscar mesa…"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 pl-9 text-sm"
      />
    </div>
  );
}

function NoCampaigns({ onCreate, onJoin }: HomeActionsProps): React.JSX.Element {
  return (
    <section className="flex flex-col items-start gap-4 border-y border-border py-10">
      <h2 className="font-display text-[28px] font-semibold">
        Você ainda não está em nenhuma mesa.
      </h2>
      <p className="max-w-prose text-muted-foreground">
        Crie uma mesa e chame a galera, ou entre numa com o código que o mestre te passou.
      </p>
      <HomeActions onCreate={onCreate} onJoin={onJoin} />
    </section>
  );
}
