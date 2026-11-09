import { ArrowLeft } from 'lucide-react';
import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import type { MapTrailStep } from '@/stores/map-view-store';

export type MapTrailProps = Readonly<{
  trail: readonly MapTrailStep[];
  /** The name of the map shown, the last of the path. */
  current: string;
  onBack: () => void;
  onReturnTo: (index: number) => void;
}>;

/** The way through the maps up to the one shown, and "Voltar"; nothing on a map reached directly.
 *
 *  Example: `<MapTrail trail={trail} current={map.name} onBack={back} onReturnTo={returnTo} />` */
export function MapTrail(props: MapTrailProps): React.JSX.Element | null {
  const { trail, current, onBack, onReturnTo } = props;
  if (trail.length === 0) return null;
  return (
    <nav aria-label="Trilha de mapas" className="flex min-w-0 items-center gap-2 px-3 py-1.5">
      <Button size="sm" variant="ghost" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        Voltar
      </Button>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
        {trail.map((step, index) => (
          <Fragment key={step.mapId}>
            <li>
              <Button size="sm" variant="link" onClick={() => onReturnTo(index)}>
                {step.name}
              </Button>
            </li>
            <TrailSeparator />
          </Fragment>
        ))}
        <li aria-current="page" className="font-medium">
          {current}
        </li>
      </ol>
    </nav>
  );
}

function TrailSeparator(): React.JSX.Element {
  return (
    <li aria-hidden="true" className="text-muted-foreground">
      ›
    </li>
  );
}
