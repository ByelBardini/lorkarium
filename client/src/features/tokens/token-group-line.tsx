import type { TokenDto } from '@lorkarium/contracts';
import { ChevronRightIcon } from 'lucide-react';
import { DEFEATED_ENTRY_SUFFIX, entryDefeated } from '@/features/combat/combat-view';
import { DefeatedLabel } from '@/features/combat/defeated-label';
import { standingTextOf, summedBarOf } from '@/lib/combat-rows';
import { cn } from '@/lib/utils';
import { SummedBarMeter } from './bar-meter';
import { TokenAvatar } from './token-avatar';

export type TokenGroupLineProps = Readonly<{
  label: string;
  /** The group's tokens this viewer sees (a hidden one neither shows nor adds up). */
  tokens: readonly TokenDto[];
  open: boolean;
  onToggle: () => void;
  /** The members, shown while open. */
  children: React.ReactNode;
}>;

/** Several tokens as one line ("Bandido ×6 · 5 de 6 de pé", their bars added up), folded so a
 *  crowd does not push the rest out of the panel; open, the members come under it.
 *
 *  Example: `<TokenGroupLine label="Bandido" tokens={bandits} open={false} onToggle={flip}>{members}</TokenGroupLine>` */
export function TokenGroupLine(props: TokenGroupLineProps): React.JSX.Element {
  const { label, tokens, open } = props;
  const [first] = tokens;
  const summed = summedBarOf(tokens);
  const color = tokens.flatMap(({ bars }) => bars).find(({ position }) => position === 0)?.color;
  return (
    <div className="flex min-w-0 flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={props.onToggle}
        className="flex w-full min-w-0 items-center gap-2.5 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {first && <TokenAvatar token={first} />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-baseline gap-1.5 text-sm font-semibold">
            <DefeatedLabel
              text={label}
              defeated={entryDefeated(tokens)}
              suffix={DEFEATED_ENTRY_SUFFIX}
              className="truncate"
            />
            {tokens.length > 1 && (
              <span className="font-normal text-muted-foreground">{`×${tokens.length}`}</span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">{standingTextOf(tokens)}</span>
        </span>
        {summed && color && (
          <SummedBarMeter name={`Barras de ${label}`} bar={summed} color={color} />
        )}
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
      </button>
      {open && props.children}
    </div>
  );
}
