import type { BadgeDto } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { badgeImageUrlOf } from '@/lib/badge-image-url';
import { cn } from '@/lib/utils';

export type ProfileCardBadgesProps = Readonly<{
  /** In the catalog's order: the most important first. */
  badges: readonly BadgeDto[];
  /** How many show before "+N" (the popover); every one without it (the modal). */
  limit?: number;
}>;

const LABEL_CLASS = 'font-brand text-[10px] font-semibold tracking-[0.14em] uppercase';
const BADGE_CLASS =
  'flex size-12 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/85';

/** "Insígnias": the person's badges as a row of images, each opening its name and description in
 *  a tooltip by hover, focus or tap; nothing when they have none.
 *
 *  Example: `<ProfileCardBadges badges={card.badges} limit={full ? undefined : 6} />` */
export function ProfileCardBadges({
  badges,
  limit,
}: ProfileCardBadgesProps): React.JSX.Element | null {
  const titleId = useId();
  if (badges.length === 0) return null;
  const shown = limit === undefined ? badges : badges.slice(0, limit);
  const hidden = badges.length - shown.length;
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 id={titleId} className={cn(LABEL_CLASS, 'text-primary')}>
        Insígnias
      </h3>
      <TooltipProvider>
        <ul aria-labelledby={titleId} className="flex flex-wrap items-center gap-1.5">
          {shown.map((badge) => (
            <li key={badge.id}>
              <BadgeButton badge={badge} />
            </li>
          ))}
          {hidden > 0 && <MoreBadges count={hidden} />}
        </ul>
      </TooltipProvider>
    </section>
  );
}

// Radix opens on hover and focus but never on a tap, and closes on any click. So a touch opens
// it on `pointerdown` and the click no longer closes it; the next tap lands outside the tooltip,
// and Radix's outside dismissal closes it.
function BadgeButton({ badge }: Readonly<{ badge: BadgeDto }>): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const openOnTouch = (event: React.PointerEvent): void => {
    if (event.pointerType === 'touch') setOpen(true);
  };
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        aria-label={`Insígnia ${badge.name}`}
        onPointerDown={openOnTouch}
        onClick={(event) => event.preventDefault()}
        className={cn(BADGE_CLASS, 'cursor-pointer outline-offset-2 focus-visible:outline-2')}
      >
        <BadgeImage badge={badge} />
      </TooltipTrigger>
      <TooltipContent
        arrow={false}
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        className="w-60 max-w-60 flex-col items-start gap-1 border border-border bg-card p-2.5 text-card-foreground"
      >
        <span className="font-display text-base">{badge.name}</span>
        <span className="text-xs whitespace-pre-line text-muted-foreground">
          {badge.description}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function BadgeImage({ badge }: Readonly<{ badge: BadgeDto }>): React.JSX.Element {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return <span className="truncate px-0.5 text-[9px] leading-tight">{badge.name}</span>;
  }
  return (
    <img
      src={badgeImageUrlOf(badge.imageId)}
      alt={badge.name}
      onError={() => setBroken(true)}
      className="size-full object-contain"
    />
  );
}

function MoreBadges({ count }: Readonly<{ count: number }>): React.JSX.Element {
  return (
    <li className={cn(BADGE_CLASS, 'text-xs font-semibold text-muted-foreground')}>
      <span aria-hidden="true">{`+${count}`}</span>
      <span className="sr-only">{`e mais ${count} insígnias`}</span>
    </li>
  );
}
