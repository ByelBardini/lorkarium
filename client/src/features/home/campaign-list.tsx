import type { CampaignSummaryDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { CampaignListHeader } from '@/components/campaign-list-header';
import { filterCampaigns } from '@/lib/campaign-list';
import { CampaignRow } from './campaign-row';
import { HomeActions, type HomeActionsProps } from './home-actions';

export type CampaignListProps = HomeActionsProps &
  Readonly<{ campaigns: readonly CampaignSummaryDto[]; readerId: string }>;

/** "Suas mesas": search over the loaded list and one row per campaign, or the empty invitation.
 *
 *  Example: `<CampaignList campaigns={campaigns} readerId={user.id} onCreate={openCreate} onJoin={openJoin} />` */
export function CampaignList({
  campaigns,
  readerId,
  onCreate,
  onJoin,
}: CampaignListProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  if (campaigns.length === 0) return <NoCampaigns onCreate={onCreate} onJoin={onJoin} />;
  const visible = filterCampaigns(campaigns, query);
  return (
    <section aria-labelledby="campaign-list-title" className="flex flex-col gap-2">
      <CampaignListHeader
        titleId="campaign-list-title"
        title="Suas mesas"
        count={visible.length}
        query={query}
        onQuery={setQuery}
        searchLabel="Buscar mesa"
      />
      {visible.length > 0 ? (
        <ul>
          {visible.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} readerId={readerId} />
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
