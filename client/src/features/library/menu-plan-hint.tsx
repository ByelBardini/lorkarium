import { ContextMenuLabel } from '@/components/ui/context-menu';
import type { PlanGate } from '@/features/plans/plan-gate';

/** The plan's sentence under the items of a tree menu it keeps off (they point at it by
 *  `aria-describedby`); nothing while the gate is open.
 *
 *  Example: `<MenuPlanHint id={hintId} gate={lock} />` */
export function MenuPlanHint({ id, gate }: Readonly<{ id: string; gate: PlanGate }>) {
  if (gate.open) return null;
  return (
    <ContextMenuLabel id={id} className="max-w-56 text-xs font-normal">
      {gate.hint}
    </ContextMenuLabel>
  );
}
