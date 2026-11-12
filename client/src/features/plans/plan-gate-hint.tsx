import { cn } from '@/lib/utils';
import type { PlanGate } from './plan-gate';

type PlanGateHintProps = Readonly<{ id: string; gate: PlanGate; className?: string }>;

/** The sentence under a control the plan keeps off (the control points at it by
 *  `aria-describedby`); nothing while the gate is open.
 *
 *  Example: `<PlanGateHint id="new-campaign-plan" gate={gate} />` */
export function PlanGateHint({ id, gate, className }: PlanGateHintProps): React.JSX.Element | null {
  if (gate.open) return null;
  return (
    <p id={id} className={cn('text-xs text-muted-foreground', className)}>
      {gate.hint}
    </p>
  );
}
