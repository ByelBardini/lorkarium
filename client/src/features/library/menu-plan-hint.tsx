import { useId, useState } from 'react';
import { ContextMenuItem, ContextMenuLabel } from '@/components/ui/context-menu';
import { planHintIdOf, type PlanGate } from '@/features/plans/plan-gate';

type PlanGatedMenuItemProps = Readonly<{
  gate: PlanGate;
  /** Off for a reason other than the plan (the table not live). */
  disabled?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}>;

/** A tree menu item the plan may keep off: closed, it looks off and choosing it keeps the menu
 *  open and shows the plan's sentence under it, instead of a line always there.
 *
 *  Example: `<PlanGatedMenuItem gate={copy} onSelect={duplicate}>Duplicar</PlanGatedMenuItem>` */
export function PlanGatedMenuItem(props: PlanGatedMenuItemProps): React.JSX.Element {
  const { gate } = props;
  const [shown, setShown] = useState(false);
  const hintId = useId();
  const choose = (event: Event): void => {
    if (gate.open) return props.onSelect();
    event.preventDefault();
    setShown(true);
  };
  return (
    <>
      <ContextMenuItem
        disabled={props.disabled}
        aria-disabled={!gate.open || props.disabled === true || undefined}
        aria-describedby={planHintIdOf(gate, hintId)}
        className={gate.open ? undefined : 'opacity-50'}
        onSelect={choose}
      >
        {props.children}
      </ContextMenuItem>
      {!gate.open && (
        <ContextMenuLabel
          id={hintId}
          role="status"
          className={shown ? 'max-w-56 text-xs font-normal' : 'sr-only'}
        >
          {gate.hint}
        </ContextMenuLabel>
      )}
    </>
  );
}
