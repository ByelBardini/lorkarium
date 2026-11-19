import { cn } from '@/lib/utils';
import type { PlanGate } from './plan-gate';

type PlanGateHintProps = Readonly<{ id: string; gate: PlanGate; className?: string }>;

/** The plan's sentence of a control it keeps off, for the screen reader only (the control points
 *  at it by `aria-describedby`): on screen the sentence shows when the control is clicked
 *  (`PlanGated`), never as a line always there. Nothing while the gate is open.
 *
 *  Example: `<PlanGateHint id="new-campaign-plan" gate={gate} />` */
export function PlanGateHint({ id, gate, className }: PlanGateHintProps): React.JSX.Element | null {
  if (gate.open) return null;
  return (
    <span id={id} className={cn('sr-only', className)}>
      {gate.hint}
    </span>
  );
}
