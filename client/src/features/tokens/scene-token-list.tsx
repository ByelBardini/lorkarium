import type { SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import { useEffect, useRef } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { formatBarValue } from '@/lib/bar-display';
import { cn } from '@/lib/utils';
import {
  singleSelectedOf,
  useBoardInteraction,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { ConditionSummary } from '@/features/combat/condition-marks';
import { SelectionConditions } from '@/features/combat/selection-conditions';
import { TokenCard } from './token-card';

export type SceneTokenListProps = Readonly<{
  board: StoreApi<BoardStore>;
  presence: StoreApi<TablePresenceStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEdit: (tokenId: string) => void;
}>;

const NO_TOKENS: readonly TokenDto[] = [];

/** "Na cena": the tokens of the scene by name, as a list with rules (no cards). The row of the
 *  selected token is open with its card; opening a row selects the token on the board too. With
 *  several selected, their rows are marked, no card opens, and the count and a condition for all
 *  of them come above.
 *
 *  Example: `<SceneTokenList board={board} presence={presence} interaction={interaction} isMaster onEdit={edit} />` */
export function SceneTokenList(props: SceneTokenListProps): React.JSX.Element {
  const tokens = useBoard(props.board, (state) => state.board?.tokens ?? NO_TOKENS);
  const members = useTablePresence(props.presence, (state) => state.members);
  const selectedIds = useBoardInteraction(props.interaction, (state) => state.selectedTokenIds);
  if (tokens.length === 0) return <EmptyScene isMaster={props.isMaster} />;
  const sorted = [...tokens].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const openId = singleSelectedOf(selectedIds);
  return (
    <div className="flex flex-col gap-2">
      {selectedIds.length > 1 && (
        <p className="text-xs text-muted-foreground">{`${selectedIds.length} selecionados`}</p>
      )}
      <SelectionConditions
        board={props.board}
        interaction={props.interaction}
        isMaster={props.isMaster}
      />
      <ul aria-label="Na cena" className="flex flex-col">
        {sorted.map((token) => (
          <TokenRow
            key={token.id}
            token={token}
            members={members}
            open={token.id === openId}
            marked={selectedIds.includes(token.id)}
            {...props}
          />
        ))}
      </ul>
    </div>
  );
}

function EmptyScene({ isMaster }: Readonly<{ isMaster: boolean }>): React.JSX.Element {
  return (
    <p className="text-sm text-muted-foreground">
      {isMaster
        ? 'Crie um token pelo + na barra de ferramentas.'
        : 'O mestre ainda não pôs ninguém na cena.'}
    </p>
  );
}

type TokenRowProps = SceneTokenListProps &
  Readonly<{
    token: TokenDto;
    members: readonly SessionMemberDto[];
    open: boolean;
    /** In the selection (alone or with others). */
    marked: boolean;
  }>;

function TokenRow({ token, members, open, marked, ...props }: TokenRowProps) {
  const { board, interaction, isMaster, onEdit } = props;
  const rowRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (open) rowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);
  const controllers = members.filter(({ userId }) => token.controllerIds.includes(userId));
  const first = token.bars.find(({ position }) => position === 0);
  return (
    <li ref={rowRef} className="border-b border-divider last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-current={marked || undefined}
        onClick={() => interaction.getState().select(open ? null : token.id)}
        className={cn(
          'flex w-full items-center gap-3 py-2 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
          marked && 'text-primary',
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center border border-border text-[11px] font-semibold"
        >
          {token.initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">{token.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {controllers.map(({ name }) => name).join(', ') || 'Sem controlador'}
          </span>
          <ConditionSummary conditions={token.conditions} />
        </span>
        {first && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{`${first.label} ${formatBarValue(first)}`}</span>
        )}
      </button>
      {open && (
        <TokenCard
          token={token}
          board={board}
          interaction={interaction}
          isMaster={isMaster}
          onEdit={onEdit}
        />
      )}
    </li>
  );
}
