import type { CombatEntryInput, TokenDto } from '@lorkarium/contracts';
import { useMemo, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { combatCountLabel, combatSummaryOf, type CombatSummary } from './combat-view';
import { EndCombatButton } from './end-combat-button';
import { useBoardSight } from '@/features/board/use-board-sight';
import { seenTokensOf } from '@/lib/board-sight';
import { canRunEntry, combatCandidatesOf } from '@/lib/combat-entries';
import { StartCombatDialog } from './start-combat-dialog';

const NO_TOKENS: readonly TokenDto[] = [];

export type CombatHeaderProps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

/** The top of the tracker: out of combat, "Iniciar combate" (master); in combat, the round as a
 *  block of text, how many are in, whose turn it is, the turn buttons and "Encerrar combate".
 *
 *  Example: `<CombatHeader board={board} interaction={interaction} isMaster={isMaster} />` */
export function CombatHeader({ board, interaction, isMaster }: CombatHeaderProps) {
  const current = useBoard(board, (state) => state.board);
  const sight = useBoardSight(board, interaction);
  const summary = useMemo(
    () => (current ? combatSummaryOf(current, seenTokensOf(current, sight)) : null),
    [current, sight],
  );
  if (!summary || !current) {
    return <OutOfCombat board={board} interaction={interaction} isMaster={isMaster} />;
  }
  const canPass =
    !isMaster && summary.current !== null && canRunEntry(summary.current, current.tokens, false);
  return (
    <InCombat summary={summary} interaction={interaction} isMaster={isMaster} canPass={canPass} />
  );
}

function OutOfCombat({ board, interaction, isMaster }: CombatHeaderProps): React.JSX.Element {
  const all = useBoard(board, (state) => state.board?.tokens ?? NO_TOKENS);
  const tokens = useMemo(() => combatCandidatesOf(all), [all]);
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const [choosing, setChoosing] = useState(false);
  const start = (entries: CombatEntryInput[]): void => {
    setChoosing(false);
    void interaction.getState().command((commands, id) => commands.startCombat(id, entries));
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs tracking-[0.12em] text-muted-foreground uppercase">Fora de combate</p>
      {isMaster && (
        <div className="flex flex-col items-start gap-1">
          <Button
            type="button"
            size="sm"
            disabled={readOnly || tokens.length === 0}
            onClick={() => setChoosing(true)}
          >
            Iniciar combate
          </Button>
          {tokens.length === 0 && (
            <p className="text-[13px] text-muted-foreground">Ponha tokens na cena primeiro.</p>
          )}
        </div>
      )}
      {choosing && (
        <StartCombatDialog tokens={tokens} onConfirm={start} onClose={() => setChoosing(false)} />
      )}
    </div>
  );
}

type InCombatProps = Readonly<{
  summary: CombatSummary;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  /** A player who controls every token of the entry on turn passes it. */
  canPass: boolean;
}>;

function InCombat({ summary, interaction, isMaster, canPass }: InCombatProps) {
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const { combat, currentLabel } = summary;
  const from = combat.currentCombatantId;
  const send = interaction.getState().command;
  const next = (): void => void (from && send((c, id) => c.nextTurn(id, from)));
  const previous = (): void => void (from && send((c, id) => c.previousTurn(id, from)));
  return (
    <section aria-label="Combate em andamento" className="flex flex-col gap-3">
      <div className="flex items-end gap-4">
        <p className="flex flex-col leading-none">
          <span className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
            Rodada
          </span>
          <span className="font-display text-3xl font-semibold tabular-nums">{combat.round}</span>
        </p>
        <p className="flex flex-col gap-0.5 text-sm">
          <span className="text-muted-foreground">{combatCountLabel(summary.count)}</span>
          {currentLabel && <span className="text-primary">{`Vez de ${currentLabel}`}</span>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isMaster && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={readOnly || !from}
              onClick={previous}
            >
              Turno anterior
            </Button>
            <Button type="button" size="sm" disabled={readOnly || !from} onClick={next}>
              Próximo turno
            </Button>
            <EndCombatButton
              disabled={readOnly}
              onConfirm={() => void send((c, id) => c.endCombat(id))}
            />
          </>
        )}
        {canPass && (
          <Button type="button" size="sm" disabled={readOnly} onClick={next}>
            Passar a vez
          </Button>
        )}
      </div>
    </section>
  );
}
