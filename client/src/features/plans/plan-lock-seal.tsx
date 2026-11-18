import { LockIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanGate } from './plan-gate';

/** The accessible name of the lock on an item kept past the plan's ceiling. */
export const PLAN_LOCK_NAME = 'Só leitura';

type PlanLockSealProps = Readonly<{ gate: PlanGate; className?: string }>;

/** The lock beside a list item the server marked `planLocked`: named "Só leitura", the read-only
 *  sentence in its tooltip; nothing while the gate is open.
 *
 *  Example: `<PlanLockSeal gate={planLockGate(table, 'scenes', scene)} />` */
export function PlanLockSeal({ gate, className }: PlanLockSealProps): React.JSX.Element | null {
  if (gate.open) return null;
  return (
    <span title={gate.hint} className={cn('flex shrink-0 text-muted-foreground', className)}>
      <LockIcon role="img" aria-label={PLAN_LOCK_NAME} aria-hidden={false} />
    </span>
  );
}
