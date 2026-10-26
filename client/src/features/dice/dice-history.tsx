import type { DiceRolledDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import { useDiceHistory, type DiceHistoryStore } from '@/stores/dice-history-store';
import type { TablePresenceStore } from '@/stores/table-presence-store';
import { HistoryRow } from './history-row';
import { useRevealClock } from './use-reveal-clock';
import { useRollerIdentity } from './use-roller-identity';

export type DiceHistoryProps = Readonly<{
  history: StoreApi<DiceHistoryStore>;
  presence: StoreApi<TablePresenceStore> | null;
  /** The wall clock the history's `revealAtMs` is on. */
  clock: InteractionClock;
  viewerId: string | null;
  /** "Rolar de novo" on the viewer's own rolls; `null` for who only watches. */
  onReroll: ((event: DiceRolledDto) => void) | null;
}>;

/** The rolls of this visit, newest first, in rows (`HistoryRow`) under "Histórico" and how many
 *  there are. It announces nothing: the notice over the board (`DiceRollNotice`) is the screen
 *  reader's only announcement of a roll, so an open tab never says it twice.
 *
 *  Example: `<DiceHistory history={table.dice} presence={table.presence} clock={deps.diceClock} viewerId={me} onReroll={reroll} />` */
export function DiceHistory(props: DiceHistoryProps): React.JSX.Element {
  const entries = useDiceHistory(props.history, (state) => state.entries);
  const rollerOf = useRollerIdentity(props.presence);
  const { now } = useRevealClock(entries, props.clock);
  return (
    <section aria-labelledby="dice-history-title" className="flex flex-col gap-1">
      <HistoryHeading count={entries.length} />
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma rolagem nesta visita.</p>
      ) : (
        <ol aria-label="Histórico de rolagens" className="flex flex-col">
          {[...entries].reverse().map((entry) => (
            <HistoryRow
              key={entry.event.rollId}
              entry={entry}
              now={now}
              roller={rollerOf(entry.event.rollerId)}
              onReroll={entry.event.rollerId === props.viewerId ? props.onReroll : null}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function HistoryHeading({ count }: Readonly<{ count: number }>): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3
        id="dice-history-title"
        className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
      >
        Histórico
      </h3>
      {count > 0 && <span className="text-xs text-muted-foreground">{rollCountText(count)}</span>}
    </div>
  );
}

function rollCountText(count: number): string {
  return `${count} ${count === 1 ? 'rolagem' : 'rolagens'}`;
}
