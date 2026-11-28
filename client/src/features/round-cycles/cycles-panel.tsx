import type { RoundCycleDto, RoundCycleVisibilityDto } from '@lorkarium/contracts';
import { useId, useMemo, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { countGate, planHintIdOf } from '@/features/plans/plan-gate';
import { PlanGateHint } from '@/features/plans/plan-gate-hint';
import { PlanGated } from '@/features/plans/plan-gated';
import { PlanLockSeal } from '@/features/plans/plan-lock-seal';
import { usePlanLimits, usePlanLock } from '@/features/plans/use-plan-limits';
import { cn } from '@/lib/utils';
import {
  draftOfCycle,
  keyOfHolder,
  NEW_CYCLE_DRAFT,
  type RoundCycleDraft,
} from '@/lib/round-cycle-form';
import type { RoundCycleFields } from '@/services/round-cycle-commands';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useCharacters, type CharactersStore } from '@/stores/characters-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import type { CyclePlayer } from './cycle-audience-fields';
import { CycleEditorDialog, type CycleHolderOption } from './cycle-editor-dialog';
import { CyclePhaseImage } from './cycle-phase-image';
import type { CycleImageTarget } from './cycle-phase-row';

export type CyclesPanelProps = Readonly<{
  table: Readonly<{
    characters: StoreApi<CharactersStore>;
    board: StoreApi<BoardStore>;
    presence: StoreApi<TablePresenceStore>;
  }>;
  interaction: StoreApi<BoardInteractionStore>;
  images: CycleImageTarget;
}>;

type Editing = Readonly<{ title: string; draft: RoundCycleDraft; cycleId: string | null }>;

const VISIBILITY_TEXT: Readonly<Record<RoundCycleVisibilityDto, string>> = {
  everyone: 'Todos veem',
  some: 'Só alguns jogadores',
  masters: 'Só o mestre',
};

/** The master's "Ciclos" tab: every cycle of the table with whose it is, who sees it and, in
 *  this grid's combat, its phase; "Novo ciclo", edit and delete (asked twice).
 *
 *  Example: `<CyclesPanel table={table} interaction={interaction} images={{ campaignId, assets }} />` */
export function CyclesPanel({ table, interaction, images }: CyclesPanelProps) {
  const cycles = useCharacters(table.characters, (state) => state.roundCycles);
  const holders = useHolderOptions(table);
  const players = usePlayers(table.presence);
  const sceneId = useBoard(table.board, (state) => state.board?.scene.id ?? null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const save = (cycleId: string | null, fields: RoundCycleFields): Promise<boolean> =>
    interaction
      .getState()
      .command((commands, scope) =>
        cycleId === null
          ? commands.defineRoundCycle(scope, fields)
          : commands.updateRoundCycle(scope, cycleId, fields),
      );
  const remove = (cycleId: string): Promise<boolean> =>
    interaction.getState().command((commands, scope) => commands.deleteRoundCycle(scope, cycleId));
  return (
    <section aria-label="Ciclos da mesa" className="flex flex-col gap-3">
      <NewCycleButton
        stored={cycles.length}
        onOpen={() => setEditing({ title: 'Novo ciclo', draft: NEW_CYCLE_DRAFT, cycleId: null })}
      />
      {cycles.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum ciclo ainda. Um ciclo vira sozinho no começo de cada rodada do combate, como as
          fases da lua.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {cycles.map((cycle) => (
          <CycleItem
            key={cycle.id}
            cycle={cycle}
            holders={holders}
            sceneId={sceneId}
            onEdit={() =>
              setEditing({ title: 'Editar ciclo', draft: draftOfCycle(cycle), cycleId: cycle.id })
            }
            onDelete={() => remove(cycle.id)}
          />
        ))}
      </ul>
      {editing && (
        <CycleEditorDialog
          title={editing.title}
          initial={editing.draft}
          holders={holders}
          players={players}
          images={images}
          onSave={(fields) => save(editing.cycleId, fields)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

// Past the owner's plan "Novo ciclo" says which plan has more (the technical 20 the server says).
function NewCycleButton({ stored, onOpen }: Readonly<{ stored: number; onOpen: () => void }>) {
  const gate = countGate(usePlanLimits().table, 'roundCycles', stored);
  const hintId = useId();
  return (
    <>
      <PlanGated gate={gate}>
        <Button
          className="self-start"
          aria-describedby={planHintIdOf(gate, hintId)}
          onClick={gate.open ? onOpen : undefined}
        >
          Novo ciclo
        </Button>
      </PlanGated>
      <PlanGateHint id={hintId} gate={gate} />
    </>
  );
}

type CycleItemProps = Readonly<{
  cycle: RoundCycleDto;
  holders: readonly CycleHolderOption[];
  sceneId: string | null;
  onEdit: () => void;
  onDelete: () => Promise<boolean>;
}>;

function CycleItem({ cycle, holders, sceneId, onEdit, onDelete }: CycleItemProps) {
  const [confirming, setConfirming] = useState(false);
  const holderKey = cycle.config ? keyOfHolder(cycle.config.holder) : 'table';
  const owner = holders.find(({ key }) => key === holderKey)?.label ?? 'Fora deste grid';
  const combat = cycle.combats.find((one) => one.sceneId === sceneId);
  const phase = cycle.phases.find(({ id }) => id === combat?.currentPhaseId);
  const visibility = cycle.config ? VISIBILITY_TEXT[cycle.config.visibility] : '';
  const lock = usePlanLock('roundCycles', cycle);
  return (
    <li className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-3">
      <span className="flex items-center justify-between gap-2 font-semibold">
        {cycle.name}
        <PlanLockSeal gate={lock} className="[&_svg]:size-3.5" />
      </span>
      <span className="text-xs text-muted-foreground">
        {[owner, visibility, cycle.announce ? 'Anuncia cada fase' : null]
          .filter(Boolean)
          .join(' · ')}
      </span>
      <PhaseStrip cycle={cycle} currentId={phase?.id ?? null} />
      {phase && <span className="text-xs text-label">Neste combate: {phase.name}</span>}
      <div className="flex gap-2">
        <PlanGated gate={lock}>
          <Button
            size="sm"
            variant="outline"
            aria-label={`Editar ${cycle.name}`}
            onClick={lock.open ? onEdit : undefined}
          >
            Editar
          </Button>
        </PlanGated>
        <Button
          size="sm"
          variant={confirming ? 'destructive' : 'ghost'}
          aria-label={confirming ? `Confirmar: apagar ${cycle.name}` : `Apagar ${cycle.name}`}
          onClick={() => (confirming ? void onDelete() : setConfirming(true))}
        >
          {confirming ? 'Confirmar' : 'Apagar'}
        </Button>
      </div>
    </li>
  );
}

type PhaseStripProps = Readonly<{ cycle: RoundCycleDto; currentId: string | null }>;

// The preview: every phase in order, its image or icon, the one of this combat ringed in gold.
function PhaseStrip({ cycle, currentId }: PhaseStripProps) {
  return (
    <ol aria-label={`Fases de ${cycle.name}`} className="flex flex-wrap items-center gap-1.5 py-1">
      {cycle.phases.map((phase) => (
        <li
          key={phase.id}
          title={phase.name}
          aria-current={phase.id === currentId ? 'step' : undefined}
          className={cn(
            'rounded-md',
            phase.id === currentId && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
          )}
        >
          <CyclePhaseImage phase={{ ...phase, phaseId: phase.id }} className="size-9" />
          <span className="sr-only">{phase.name}</span>
        </li>
      ))}
    </ol>
  );
}

// "A mesa", then the table's characters, then the loose tokens of the grid shown.
function useHolderOptions(table: CyclesPanelProps['table']): CycleHolderOption[] {
  const characters = useCharacters(table.characters, (state) => state.characters);
  const tokens = useBoard(table.board, (state) => state.board?.tokens);
  return useMemo(() => {
    const ofCharacters = characters.map(({ id, name }) => ({
      key: `character:${id}`,
      label: name,
    }));
    const loose = (tokens ?? []).filter(({ characterId }) => characterId === null);
    const ofTokens = loose.map(({ id, name }) => ({
      key: `token:${id}`,
      label: `${name} (token)`,
    }));
    return [{ key: 'table', label: 'A mesa (todo combate)' }, ...ofCharacters, ...ofTokens];
  }, [characters, tokens]);
}

function usePlayers(presence: StoreApi<TablePresenceStore>): CyclePlayer[] {
  const members = useTablePresence(presence, (state) => state.members);
  return useMemo(
    () =>
      members.filter(({ role }) => role === 'player').map(({ userId, name }) => ({ userId, name })),
    [members],
  );
}
