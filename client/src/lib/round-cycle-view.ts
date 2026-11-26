import type { RoundCycleDto, RoundCyclePhaseDto } from '@lorkarium/contracts';
import { nextPhaseOf } from '@lorkarium/game-core';

/** One phase as the badge and the picker show it. */
export type CyclePhaseView = Readonly<{
  phaseId: string;
  name: string;
  imageAssetId: string | null;
}>;

/** A phase in the "phase of the next round" list: `current` = picking it repeats the phase,
 *  `follows` = where the cycle goes on its own; `isNext` = the one the next round plays. */
export type CycleOption = CyclePhaseView &
  Readonly<{ tag: 'current' | 'follows' | null; isNext: boolean }>;

/** What the badge of one cycle on this grid shows. */
export type CycleBadge = Readonly<{
  cycleId: string;
  name: string;
  round: number;
  current: CyclePhaseView | null;
  next: CyclePhaseView | null;
  /** The next phase was picked by hand (the cycle would go elsewhere on its own). */
  chosen: boolean;
  canChoose: boolean;
  options: readonly CycleOption[];
}>;

/** The badges of the cycles in the combat of `sceneId`, in the order the table lists them; the
 *  next phase comes from the game-core rule, never recomputed here.
 *
 *  Example: `cycleBadgesOf(roundCycles, sceneId)[0]?.next?.name // 'Crescente'` */
export function cycleBadgesOf(cycles: readonly RoundCycleDto[], sceneId: string): CycleBadge[] {
  return cycles.flatMap((cycle) => {
    const combat = cycle.combats.find((one) => one.sceneId === sceneId);
    return combat ? [badgeOf(cycle, combat)] : [];
  });
}

function badgeOf(cycle: RoundCycleDto, combat: RoundCycleDto['combats'][number]): CycleBadge {
  const ids = cycle.phases.map(({ id }) => id);
  const state = { currentId: combat.currentPhaseId, chosenId: combat.chosenPhaseId };
  const nextId = nextPhaseOf(ids, state);
  const followsId = nextPhaseOf(ids, { ...state, chosenId: null });
  return {
    cycleId: cycle.id,
    name: cycle.name,
    round: combat.round,
    current: viewOf(cycle.phases, combat.currentPhaseId),
    next: viewOf(cycle.phases, nextId),
    chosen: nextId !== followsId,
    canChoose: cycle.canChoose,
    options: cycle.phases.map((phase) => optionOf(phase, combat.currentPhaseId, followsId, nextId)),
  };
}

function optionOf(
  phase: RoundCyclePhaseDto,
  currentId: string | null,
  followsId: string | null,
  nextId: string | null,
): CycleOption {
  const tag = phase.id === currentId ? 'current' : phase.id === followsId ? 'follows' : null;
  return { ...toView(phase), tag, isNext: phase.id === nextId };
}

function viewOf(phases: readonly RoundCyclePhaseDto[], id: string | null): CyclePhaseView | null {
  const phase = phases.find((one) => one.id === id);
  return phase ? toView(phase) : null;
}

function toView({ id, name, imageAssetId }: RoundCyclePhaseDto): CyclePhaseView {
  return { phaseId: id, name, imageAssetId };
}
