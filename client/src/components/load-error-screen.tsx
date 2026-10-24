import { RotateCwIcon } from 'lucide-react';
import { useRevalidator, useRouteError } from 'react-router';
import { ApiLoadError } from '@/app/shell/api-loader';
import { Button } from '@/components/ui/button';
import { OFFLINE_MESSAGE } from '@/features/campaigns/campaign-messages';

export type LoadErrorScreenProps = Readonly<{
  /** The `<title>` of the page that failed, e.g. "Lorkarium · Mesas". */
  pageTitle: string;
  /** The heading when the failure is not the network, e.g. "Não deu para carregar suas mesas." */
  failedHeading: string;
}>;

/** The `ErrorBoundary` of a screen whose loader failed: what happened and "Tentar de novo" (re-runs
 *  the loader). Offline says so; anything else gets the screen's own heading.
 *
 *  Example: `<LoadErrorScreen pageTitle="Lorkarium · Mesas" failedHeading="Não deu para carregar suas mesas." />` */
export function LoadErrorScreen({
  pageTitle,
  failedHeading,
}: LoadErrorScreenProps): React.JSX.Element {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const offline = error instanceof ApiLoadError && error.kind === 'offline';
  return (
    <div className="flex w-full flex-col items-start gap-4 px-4 py-16 sm:px-8 lg:px-12">
      <title>{pageTitle}</title>
      <h1 className="font-display text-[32px] font-semibold">
        {offline ? 'Sem conexão' : failedHeading}
      </h1>
      <p role="alert" className="text-muted-foreground">
        {offline ? OFFLINE_MESSAGE : 'Tente de novo em instantes.'}
      </p>
      <Button
        variant="outline"
        size="lg"
        onClick={() => void revalidator.revalidate()}
        disabled={revalidator.state !== 'idle'}
      >
        <RotateCwIcon aria-hidden="true" />
        Tentar de novo
      </Button>
    </div>
  );
}
