import type { CampaignDetailDto } from '@lorkarium/contracts';
import { ArrowLeftIcon } from 'lucide-react';
import { Link, useLoaderData, useRouteError } from 'react-router';
import { ApiLoadError } from '@/app/shell/api-loader';
import { CampaignCover } from '@/components/campaign-cover';
import { campaignMeta } from '@/lib/campaign-meta';
import type { CampaignLoaderData } from './campaign-loader-data';
import { failureMessage } from './campaign-messages';

export type CampaignTablePageProps = Readonly<{ campaign: CampaignDetailDto }>;

/** Where "Entrar na mesa" lands until the board exists; the board will take the middle.
 *
 *  Example: `<CampaignTablePage campaign={campaign} />` */
export function CampaignTablePage({ campaign }: CampaignTablePageProps): React.JSX.Element {
  return (
    <div className="flex w-full flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
      <title>{`Lorkarium · ${campaign.name}`}</title>
      <BackToCampaigns />
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[40px] leading-[1.05] font-semibold">{campaign.name}</h1>
        <p className="text-sm text-muted-foreground">{campaignMeta(campaign)}</p>
      </header>
      <div className="relative">
        <CampaignCover campaignId={campaign.id} className="h-72 border-y border-border" />
        <p className="absolute inset-0 grid place-items-center font-display text-2xl text-label">
          O tabuleiro abre aqui.
        </p>
      </div>
    </div>
  );
}

/** The table route: the page over the campaign its loader brought.
 *
 *  Example: `{ path: 'campaigns/:campaignId/table', loader, Component: CampaignTableRoute }` */
export function CampaignTableRoute(): React.JSX.Element {
  const { campaign } = useLoaderData<CampaignLoaderData>();
  return <CampaignTablePage campaign={campaign} />;
}

/** The table route when its campaign could not load.
 *
 *  Example: `{ path: 'campaigns/:campaignId/table', ErrorBoundary: CampaignTableErrorPage }` */
export function CampaignTableErrorPage(): React.JSX.Element {
  const error = useRouteError();
  const kind = error instanceof ApiLoadError ? error.kind : 'unexpected';
  return (
    <div className="flex w-full flex-col items-start gap-4 px-4 py-16 sm:px-8 lg:px-12">
      <title>Lorkarium · Mesa</title>
      <h1 className="font-display text-[32px] font-semibold">
        {kind === 'not_found' ? 'Mesa não encontrada.' : 'Não deu para abrir a mesa.'}
      </h1>
      <p className="text-muted-foreground">{failureMessage(kind)}</p>
      <BackToCampaigns />
    </div>
  );
}

function BackToCampaigns(): React.JSX.Element {
  return (
    <Link to="/" className="inline-flex w-fit items-center gap-2 text-sm">
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      Voltar para as mesas
    </Link>
  );
}
