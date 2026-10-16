import { ArrowLeftIcon } from 'lucide-react';
import { Link, useRouteError } from 'react-router';
import { ApiLoadError } from '@/app/shell/api-loader';
import { failureMessage } from './campaign-messages';

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
