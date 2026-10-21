import type { SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import { DEFEATED_TOKEN_SUFFIX } from '@/features/combat/combat-view';
import { ConditionTags } from '@/features/combat/condition-tag';
import { DefeatedLabel } from '@/features/combat/defeated-label';
import { playedByText } from '@/lib/played-by';
import { cn } from '@/lib/utils';
import { TokenBarMeter } from './bar-meter';
import { TokenAvatar } from './token-avatar';

export type TokenLineProps = Readonly<{
  token: TokenDto;
  members: readonly SessionMemberDto[];
  /** In the selection: the name turns gold. */
  selected: boolean;
  onSelect: () => void;
  /** A member under its group: smaller, without who plays it, the conditions counted. */
  compact?: boolean;
}>;

/** One token as the panel lists it: its face with the ring of its side, the name (struck when
 *  defeated), who plays it, its first bar and its conditions. Picking it selects the token; the
 *  detail opens at the foot of the panel, never inside the line.
 *
 *  Example: `<TokenLine token={kael} members={members} selected={false} onSelect={pick} />` */
export function TokenLine(props: TokenLineProps): React.JSX.Element {
  const { token, selected, compact = false } = props;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <button
        type="button"
        aria-pressed={selected}
        onClick={props.onSelect}
        className={cn(
          'flex w-full min-w-0 items-center gap-2.5 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
          token.defeated && 'opacity-60',
        )}
      >
        <TokenAvatar token={token} size={compact ? 'sm' : 'md'} />
        <span className="flex min-w-0 flex-1 flex-col">
          <DefeatedLabel
            text={token.name}
            defeated={token.defeated}
            suffix={DEFEATED_TOKEN_SUFFIX}
            className={cn('truncate text-sm font-semibold', selected && 'text-primary')}
          />
          {compact ? (
            <ConditionCount count={token.conditions.length} />
          ) : (
            <span className="truncate text-xs text-muted-foreground">
              {playedByText(token, props.members)}
            </span>
          )}
        </span>
        <TokenBarMeter token={token} />
      </button>
      {!compact && <ConditionTags owner={token.name} conditions={token.conditions} />}
    </div>
  );
}

function ConditionCount({ count }: Readonly<{ count: number }>): React.JSX.Element | null {
  if (count === 0) return null;
  return (
    <span className="text-xs text-muted-foreground">
      {count === 1 ? '1 condição' : `${count} condições`}
    </span>
  );
}
