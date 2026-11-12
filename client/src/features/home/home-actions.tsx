import { KeyRoundIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OPEN_GATE, type PlanGate, planHintIdOf } from '@/features/plans/plan-gate';
import { PlanGateHint } from '@/features/plans/plan-gate-hint';

export type HomeActionsProps = Readonly<{
  onCreate: () => void;
  onJoin: () => void;
  /** Whether the account's plan has room for one more table as owner. */
  createGate?: PlanGate;
}>;

const CREATE_HINT_ID = 'new-campaign-plan-hint';

/** "Entrar com código" and "Nova mesa", side by side; "Nova mesa" off, with the plan's
 *  sentence under it, once the account owns as many tables as its plan allows.
 *
 *  Example: `<HomeActions onCreate={openCreate} onJoin={openJoin} createGate={gate} />` */
export function HomeActions({
  onCreate,
  onJoin,
  createGate = OPEN_GATE,
}: HomeActionsProps): React.JSX.Element {
  return (
    <div className="flex max-w-sm flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={onJoin}>
          <KeyRoundIcon aria-hidden="true" />
          Entrar com código
        </Button>
        <Button
          size="lg"
          onClick={onCreate}
          disabled={!createGate.open}
          aria-describedby={planHintIdOf(createGate, CREATE_HINT_ID)}
        >
          <PlusIcon aria-hidden="true" />
          Nova mesa
        </Button>
      </div>
      <PlanGateHint id={CREATE_HINT_ID} gate={createGate} className="text-right" />
    </div>
  );
}
