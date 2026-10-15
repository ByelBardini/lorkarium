import { RotateCwIcon } from 'lucide-react';
import { useRevalidator, useRouteError } from 'react-router';
import { ApiLoadError } from '@/app/shell/api-loader';
import { Button } from '@/components/ui/button';
import { OFFLINE_MESSAGE } from '@/features/campaigns/campaign-messages';

/** The home when its list could not load: what happened and "Tentar de novo" (re-runs the loader).
 *
 *  Example: `{ id: 'home', loader, ErrorBoundary: HomeErrorScreen }` */
export function HomeErrorScreen(): React.JSX.Element {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const offline = error instanceof ApiLoadError && error.kind === 'offline';
  const retrying = revalidator.state !== 'idle';
  return (
    <div className="flex w-full flex-col items-start gap-4 px-4 py-16 sm:px-8 lg:px-12">
      <title>Lorkarium · Mesas</title>
      <h1 className="font-display text-[32px] font-semibold">
        {offline ? 'Sem conexão' : 'Não deu para carregar suas mesas.'}
      </h1>
      <p role="alert" className="text-muted-foreground">
        {offline ? OFFLINE_MESSAGE : 'Tente de novo em instantes.'}
      </p>
      <Button
        variant="outline"
        size="lg"
        onClick={() => void revalidator.revalidate()}
        disabled={retrying}
      >
        <RotateCwIcon aria-hidden="true" />
        Tentar de novo
      </Button>
    </div>
  );
}
