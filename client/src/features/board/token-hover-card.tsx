import type { ActiveConditionDto, TokenDto } from '@lorkarium/contracts';
import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { roundsLeftText } from '@/features/combat/combat-view';
import { ConditionMark } from '@/features/combat/condition-marks';
import { TokenBarMeter } from '@/features/tokens/bar-meter';
import { seenTokensOf } from '@/lib/board-sight';
import { conditionsAsListed } from '@/lib/condition-order';
import { cn } from '@/lib/utils';
import type { ScreenRect } from '@/renderer/board-renderer';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useBoardSight } from './use-board-sight';
import type { TokenHoverRequest } from './use-token-hover';

export type TokenHoverCardProps = Readonly<{
  request: TokenHoverRequest;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** Beside the hovered token: its name, its bar (when this viewer gets it) and every condition
 *  with how long it lasts — what the strip on the board has no room for. Only for a token this
 *  viewer sees; nothing once it is gone. Never takes the focus nor the pointer.
 *
 *  Example: `{hovered && <TokenHoverCard request={hovered} board={board} interaction={interaction} />}` */
export function TokenHoverCard({ request, board, interaction }: TokenHoverCardProps) {
  const state = useBoard(board, (current) => current.board);
  const sight = useBoardSight(board, interaction);
  const token = useMemo(
    () => (state ? seenTokensOf(state, sight).find(({ id }) => id === request.tokenId) : undefined),
    [state, sight, request.tokenId],
  );
  const anchor = useMemo(() => ({ current: measurableOf(request.rect) }), [request.rect]);
  if (!token) return null;
  return (
    <Popover open>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        role="tooltip"
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="pointer-events-none w-60 gap-2 bg-card text-card-foreground"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-display text-base">{token.name}</span>
          <TokenBarMeter token={token} />
        </div>
        <HoverConditions token={token} />
      </PopoverContent>
    </Popover>
  );
}

function HoverConditions({ token }: Readonly<{ token: TokenDto }>) {
  if (token.conditions.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Nenhuma condição.</p>;
  }
  return (
    <ul aria-label={`Condições de ${token.name}`} className="flex flex-col gap-1">
      {conditionsAsListed(token.conditions).map((condition) => (
        <HoverCondition key={condition.id} condition={condition} />
      ))}
    </ul>
  );
}

function HoverCondition({ condition }: Readonly<{ condition: ActiveConditionDto }>) {
  const ending = condition.remainingRounds === 1;
  return (
    <li className="flex items-center gap-2 text-sm">
      <ConditionMark icon={condition.icon} tone={condition.tone} />
      <span className="min-w-0 flex-1 truncate">{condition.name}</span>
      <span
        className={cn(
          'shrink-0 text-xs tabular-nums',
          ending ? 'text-destructive-text' : 'text-muted-foreground',
        )}
      >
        {roundsLeftText(condition.remainingRounds)}
      </span>
    </li>
  );
}

// The Radix popper anchors to anything that measures like an element.
function measurableOf(rect: ScreenRect): Readonly<{ getBoundingClientRect: () => DOMRect }> {
  const { x, y, width, height } = rect;
  const box = { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height };
  return { getBoundingClientRect: () => ({ ...box, toJSON: () => box }) };
}
