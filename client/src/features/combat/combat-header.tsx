import type { TokenDto } from '@lorkarium/contracts';
import { SwordsIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { useBoardSight } from '@/features/board/use-board-sight';
import { seenTokensOf } from '@/lib/board-sight';
import {
  canRunEntry,
  combatCandidatesOf,
  entryOfToken,
  OUT_OF_SIGHT_LABEL,
} from '@/lib/combat-entries';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { CombatMenu } from './combat-menu';
import { combatSummaryOf, type CombatSummary } from './combat-view';
import { EndCombatConfirm } from './end-combat-confirm';
import { TurnControls } from './turn-controls';

const NO_TOKENS: readonly TokenDto[] = [];

export type CombatHeaderProps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  /** "Iniciar combate": the panel opens the preparation. */
  onPrepare: () => void;
  /** "Adicionar ao combate": the preparation of who is out. */
  onAdd: () => void;
  /** "Entrada sem token": the form under the header. */
  onTokenless: () => void;
  /** What the last change of turn told (under the turn buttons). */
  recap?: React.ReactNode;
}>;

/** The top of the combat tab: out of combat, how many tokens the scene has and the master's
 *  "Iniciar combate"; in combat, the round, whose turn it is, the "⋯" of the master, the turn
 *  buttons and who comes next.
 *
 *  Example: `<CombatHeader board={board} interaction={interaction} isMaster onPrepare={prepare} onAdd={add} onTokenless={form} />` */
export function CombatHeader(props: CombatHeaderProps): React.JSX.Element {
  const { board, interaction } = props;
  const current = useBoard(board, (state) => state.board);
  const sight = useBoardSight(board, interaction);
  const seen = useMemo(
    () => (current ? seenTokensOf(current, sight) : NO_TOKENS),
    [current, sight],
  );
  const summary = useMemo(() => combatSummaryOf(current, seen), [current, seen]);
  if (!summary || !current) return <OutOfCombat {...props} seen={seen} />;
  return <InCombat {...props} summary={summary} seen={seen} tokens={current.tokens} />;
}

type OutOfCombatProps = CombatHeaderProps & Readonly<{ seen: readonly TokenDto[] }>;

function OutOfCombat({ interaction, isMaster, onPrepare, seen }: OutOfCombatProps) {
  const count = combatCandidatesOf(seen).length;
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Fora de combate
        </span>{' '}
        <span className="text-xs text-muted-foreground">
          {count === 1 ? '1 token na cena' : `${count} tokens na cena`}
        </span>
      </p>
      {isMaster && (
        <>
          <Button
            type="button"
            size="xl"
            className="h-12"
            disabled={readOnly || count === 0}
            onClick={onPrepare}
          >
            <SwordsIcon aria-hidden="true" />
            Iniciar combate
          </Button>
          {count === 0 && (
            <p className="text-[13px] text-muted-foreground">Ponha tokens na cena primeiro.</p>
          )}
        </>
      )}
    </div>
  );
}

type InCombatProps = CombatHeaderProps &
  Readonly<{ summary: CombatSummary; seen: readonly TokenDto[]; tokens: readonly TokenDto[] }>;

function InCombat(props: InCombatProps) {
  const { summary, interaction, isMaster } = props;
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const [confirming, setConfirming] = useState(false);
  const { combat } = summary;
  const from = combat.currentCombatantId;
  const send = interaction.getState().command;
  const canPass =
    !isMaster && summary.current !== null && canRunEntry(summary.current, props.tokens, false);
  const canAdd = combatCandidatesOf(props.tokens).some(({ id }) => !entryOfToken(combat, id));
  return (
    <section aria-label="Combate em andamento" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <RoundBox round={combat.round} />
        <TurnName label={summary.currentLabel} />
        {isMaster && (
          <CombatMenu
            disabled={readOnly}
            canAdd={canAdd}
            onAdd={props.onAdd}
            onTokenless={props.onTokenless}
            onEnd={() => setConfirming(true)}
          />
        )}
      </div>
      {confirming && (
        <EndCombatConfirm
          disabled={readOnly}
          onConfirm={() => void send((c, id) => c.endCombat(id))}
          onCancel={() => setConfirming(false)}
        />
      )}
      <TurnControls
        combat={combat}
        seenTokens={props.seen}
        isMaster={isMaster}
        canPass={canPass}
        readOnly={readOnly}
        onNext={() => void (from && send((c, id) => c.nextTurn(id, from)))}
        onPrevious={() => void (from && send((c, id) => c.previousTurn(id, from)))}
      />
      {props.recap}
    </section>
  );
}

function RoundBox({ round }: Readonly<{ round: number }>) {
  return (
    <p className="flex size-14 shrink-0 flex-col items-center justify-center rounded-md border border-primary/50 leading-none">
      <span className="text-[9px] font-semibold tracking-[0.16em] text-primary uppercase">
        Rodada
      </span>{' '}
      <span className="font-display text-3xl font-semibold tabular-nums">{round}</span>
    </p>
  );
}

function TurnName({ label }: Readonly<{ label: string | null }>) {
  if (!label) return <span className="flex-1" />;
  const name = label === OUT_OF_SIGHT_LABEL ? 'alguém fora de vista' : label;
  return (
    <p className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">Vez de</span>{' '}
      <span className="truncate font-display text-2xl leading-tight font-semibold">{name}</span>
    </p>
  );
}
