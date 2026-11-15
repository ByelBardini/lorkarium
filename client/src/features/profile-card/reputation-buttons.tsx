import type { ReputationSummaryDto, ReputationVoteValue } from '@lorkarium/contracts';
import { ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { cardCount } from './profile-card-text';

export type ReputationButtonsProps = Readonly<{
  reputation: ReputationSummaryDto;
  /** Only who shares a table with the person votes; off, the hint says why. */
  allowed: boolean;
  busy: boolean;
  /** `null` takes the reader's vote back (the button already pressed was clicked again). */
  onVote: (value: ReputationVoteValue | null) => void;
}>;

const NOT_ALLOWED_HINT = 'Só quem divide uma mesa com a pessoa pode votar.';

/** 👍 and 👎 with their counts; the reader's vote is pressed, and clicking it again removes it.
 *
 *  Example: `<ReputationButtons reputation={card.reputation} allowed busy={false} onVote={vote} />` */
export function ReputationButtons(props: ReputationButtonsProps): React.JSX.Element {
  const hintId = useId();
  const { reputation } = props;
  return (
    <span
      title={props.allowed ? undefined : NOT_ALLOWED_HINT}
      className="inline-flex overflow-hidden rounded-lg border border-border"
    >
      <VoteButton {...props} value={1} count={reputation.up} hintId={hintId} />
      <VoteButton {...props} value={-1} count={reputation.down} hintId={hintId} />
      {!props.allowed && (
        <span id={hintId} className="sr-only">
          {NOT_ALLOWED_HINT}
        </span>
      )}
    </span>
  );
}

type VoteButtonProps = ReputationButtonsProps &
  Readonly<{ value: ReputationVoteValue; count: number; hintId: string }>;

function VoteButton(props: VoteButtonProps): React.JSX.Element {
  const pressed = props.reputation.myVote === props.value;
  const up = props.value === 1;
  const Icon = up ? ThumbsUpIcon : ThumbsDownIcon;
  const votes = votesText(props.count);
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${up ? 'Aprovar' : 'Reprovar'}, ${votes}`}
      aria-describedby={props.allowed ? undefined : props.hintId}
      disabled={!props.allowed || props.busy}
      onClick={() => props.onVote(pressed ? null : props.value)}
      className={cn(
        'inline-flex items-center gap-1.5 bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground tabular-nums hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50',
        !up && 'border-l border-border',
        pressed && (up ? 'text-chart-4' : 'text-destructive-text'),
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {cardCount(props.count)}
    </button>
  );
}

function votesText(count: number): string {
  return count === 1 ? '1 voto' : `${cardCount(count)} votos`;
}

/** The counts of 👍 and 👎 without buttons: the person's own card, where no one votes but the
 *  percentage alone hides the votes under the minimum.
 *
 *  Example: `<ReputationTally reputation={card.reputation} />` */
export function ReputationTally({
  reputation,
}: Readonly<{ reputation: ReputationSummaryDto }>): React.JSX.Element {
  return (
    <p className="flex items-center gap-3 px-4 pb-3 text-xs font-semibold text-muted-foreground tabular-nums">
      <span
        role="img"
        aria-label={`Aprovações, ${votesText(reputation.up)}`}
        className="inline-flex items-center gap-1.5"
      >
        <ThumbsUpIcon aria-hidden="true" className="size-3.5" />
        {cardCount(reputation.up)}
      </span>
      <span
        role="img"
        aria-label={`Reprovações, ${votesText(reputation.down)}`}
        className="inline-flex items-center gap-1.5"
      >
        <ThumbsDownIcon aria-hidden="true" className="size-3.5" />
        {cardCount(reputation.down)}
      </span>
    </p>
  );
}
