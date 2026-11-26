import { useState } from 'react';
import { cn } from '@/lib/utils';
import { assetUrlOf } from '@/services/assets-api';
import type { CyclePhaseView } from '@/lib/round-cycle-view';

export type CyclePhaseImageProps = Readonly<{
  phase: CyclePhaseView;
  /** Tailwind size of the square, e.g. `size-11`. */
  className?: string;
}>;

/** The image of one phase (a GIF animates by itself in the `<img>`); without one, or when it fails
 *  to load, the first letter of its name on a plain square. Decorative: the name goes beside it.
 *
 *  Example: `<CyclePhaseImage phase={badge.current} className="size-11" />` */
export function CyclePhaseImage({ phase, className }: CyclePhaseImageProps): React.JSX.Element {
  const [brokenId, setBrokenId] = useState<string | null>(null);
  const image = phase.imageAssetId !== brokenId ? phase.imageAssetId : null;
  const box = cn('shrink-0 overflow-hidden rounded-md border border-input bg-muted', className);
  if (image === null) {
    return (
      <span aria-hidden="true" className={cn(box, 'flex items-center justify-center')}>
        <span className="font-display text-lg text-muted-foreground">{phase.name.charAt(0)}</span>
      </span>
    );
  }
  return (
    <img
      src={assetUrlOf(image)}
      alt=""
      onError={() => setBrokenId(image)}
      className={cn(box, 'object-cover')}
    />
  );
}
