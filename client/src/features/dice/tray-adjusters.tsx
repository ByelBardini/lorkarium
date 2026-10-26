import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addCustomDie, addModifier, trayModifierOf, type DiceTray } from '@/lib/dice-tray';
import { cn } from '@/lib/utils';

export type TrayAdjustersProps = Readonly<{ tray: DiceTray; onTray: (tray: DiceTray) => void }>;

/** The line under the dice: the modifier stepper (− value +, read from the formula) and the die
 *  of any sides ("d" + sides + "+ dado").
 *
 *  Example: `<TrayAdjusters tray={tray} onTray={setTray} />` */
export function TrayAdjusters({ tray, onTray }: TrayAdjustersProps): React.JSX.Element {
  return (
    <div className="flex items-start gap-1.5">
      <ModifierStepper tray={tray} onTray={onTray} />
      <span className="mt-2.5 min-w-0 truncate text-xs text-muted-foreground">modificador</span>
      <span className="flex-1" />
      <CustomDieField tray={tray} onTray={onTray} />
    </div>
  );
}

function ModifierStepper({ tray, onTray }: TrayAdjustersProps): React.JSX.Element {
  const modifier = trayModifierOf(tray);
  return (
    <div
      role="group"
      aria-label="Modificador"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-input p-0.5"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Diminuir modificador"
        onClick={() => onTray(addModifier(tray, -1))}
      >
        −
      </Button>
      <span
        className={cn(
          'min-w-9 text-center text-[15px] font-bold tabular-nums',
          modifier ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {modifierTextOf(modifier)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Aumentar modificador"
        onClick={() => onTray(addModifier(tray, 1))}
      >
        +
      </Button>
    </div>
  );
}

function modifierTextOf(modifier: number | null): string {
  if (modifier === null) return '—';
  if (modifier > 0) return `+${modifier}`;
  return modifier < 0 ? `−${Math.abs(modifier)}` : '0';
}

const CUSTOM_SIDES_HINT = 'De 2 a 1000 faces.';

function CustomDieField({ tray, onTray }: TrayAdjustersProps): React.JSX.Element {
  const id = useId();
  const [sides, setSides] = useState('');
  const [invalid, setInvalid] = useState(false);
  const add = () => {
    try {
      onTray(addCustomDie(tray, Number(sides)));
      setSides('');
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  };
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex shrink-0 items-center gap-1">
        <span aria-hidden="true" className="text-sm text-muted-foreground">
          d
        </span>
        <Input
          aria-label="Faces do dado"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-hint` : undefined}
          inputMode="numeric"
          placeholder="7"
          value={sides}
          onChange={(event) => setSides(event.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={(event) => event.key === 'Enter' && add()}
          className="h-9 w-12 px-1.5 text-center text-sm"
        />
        <Button
          variant="outline"
          size="lg"
          aria-label="Adicionar dado"
          disabled={sides === ''}
          onClick={add}
        >
          + dado
        </Button>
      </div>
      {invalid && (
        <span id={`${id}-hint`} className="text-xs text-destructive-text">
          {CUSTOM_SIDES_HINT}
        </span>
      )}
    </div>
  );
}
