import { LoadErrorScreen } from '@/components/load-error-screen';

/** The home when its list could not load: what happened and "Tentar de novo" (re-runs the loader).
 *
 *  Example: `{ id: 'home', loader, ErrorBoundary: HomeErrorScreen }` */
export function HomeErrorScreen(): React.JSX.Element {
  return (
    <LoadErrorScreen
      pageTitle="Lorkarium · Mesas"
      failedHeading="Não deu para carregar suas mesas."
    />
  );
}
