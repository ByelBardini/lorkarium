import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { PlanGate } from './plan-gate';

type PlanGatedProps = Readonly<{ gate: PlanGate; children: React.ReactElement }>;

/** A control the plan keeps off: it looks off (`aria-disabled`) but still takes the click, which
 *  opens the plan's sentence beside it; nothing changes while the gate is open. The child drops
 *  its own action while closed (`onClick={gate.open ? act : undefined}`), since the click only
 *  opens the sentence.
 *
 *  Example: `<PlanGated gate={copy}><Button onClick={copy.open ? duplicate : undefined}>Duplicar</Button></PlanGated>` */
export function PlanGated({ gate, children }: PlanGatedProps): React.JSX.Element {
  if (gate.open) return children;
  return (
    <Popover>
      <PopoverTrigger asChild aria-disabled="true" className="cursor-not-allowed opacity-50">
        {children}
      </PopoverTrigger>
      <PopoverContent role="status" className="w-auto max-w-72 text-xs">
        {gate.hint}
      </PopoverContent>
    </Popover>
  );
}
