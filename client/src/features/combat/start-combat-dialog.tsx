import type { CombatEntryInput, TokenDto } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { startEntriesOf } from '@/lib/combat-entries';
import { cn } from '@/lib/utils';

export type StartCombatDialogProps = Readonly<{
  /** The tokens that can enter (the Tokens layer of the scene), in the order they enter. */
  tokens: readonly TokenDto[];
  onConfirm: (entries: CombatEntryInput[]) => void;
  onClose: () => void;
}>;

/** "Iniciar combate": the tokens, all checked; "Inimigos numa iniciativa só" (checked) puts the
 *  enemies in one entry, but those marked "Iniciativa própria".
 *
 *  Example: `<StartCombatDialog tokens={candidates} onConfirm={start} onClose={close} />` */
export function StartCombatDialog(props: StartCombatDialogProps): React.JSX.Element {
  const { tokens, onConfirm, onClose } = props;
  const [chosen, setChosen] = useState<readonly string[]>(() => tokens.map(({ id }) => id));
  const [enemiesTogether, setEnemiesTogether] = useState(true);
  const [ownInitiativeIds, setOwnInitiativeIds] = useState<readonly string[]>([]);
  const hasEnemies = tokens.some(({ side }) => side === 'enemy');
  const confirm = (): void => {
    const entering = tokens.filter(({ id }) => chosen.includes(id));
    onConfirm(startEntriesOf(entering, { enemiesTogether, ownInitiativeIds }));
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Iniciar combate</DialogTitle>
          <DialogDescription>Marque quem entra. A ordem segue a iniciativa.</DialogDescription>
        </DialogHeader>
        {hasEnemies && (
          <CheckField
            label="Inimigos numa iniciativa só"
            checked={enemiesTogether}
            onCheckedChange={setEnemiesTogether}
          />
        )}
        <TokenChoices
          tokens={tokens}
          chosen={chosen}
          onChosenChange={setChosen}
          ownInitiative={enemiesTogether ? ownInitiativeIds : null}
          onOwnInitiativeChange={setOwnInitiativeIds}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={chosen.length === 0} onClick={confirm}>
            Iniciar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type TokenChoicesProps = Readonly<{
  tokens: readonly TokenDto[];
  chosen: readonly string[];
  onChosenChange: (chosen: readonly string[]) => void;
  /** The enemies marked "Iniciativa própria"; `null` offers no such mark. */
  ownInitiative?: readonly string[] | null;
  onOwnInitiativeChange?: (ids: readonly string[]) => void;
}>;

/** One checkbox per token, by name; with `ownInitiative`, each enemy also gets "Iniciativa
 *  própria de Gigante".
 *
 *  Example: `<TokenChoices tokens={outside} chosen={chosen} onChosenChange={setChosen} />` */
export function TokenChoices(props: TokenChoicesProps): React.JSX.Element {
  const { tokens, chosen, onChosenChange, ownInitiative = null, onOwnInitiativeChange } = props;
  const toggled = (ids: readonly string[], id: string, on: boolean): string[] =>
    on ? [...ids, id] : ids.filter((other) => other !== id);
  return (
    <ul className="flex flex-col gap-2">
      {tokens.map((token) => (
        <li key={token.id} className="flex flex-col gap-1.5">
          <CheckField
            label={token.name}
            checked={chosen.includes(token.id)}
            onCheckedChange={(on) => onChosenChange(toggled(chosen, token.id, on))}
          />
          {ownInitiative && token.side === 'enemy' && (
            <CheckField
              className="pl-7"
              label={`Iniciativa própria de ${token.name}`}
              checked={ownInitiative.includes(token.id)}
              onCheckedChange={(on) =>
                onOwnInitiativeChange?.(toggled(ownInitiative, token.id, on))
              }
            />
          )}
        </li>
      ))}
    </ul>
  );
}

type CheckFieldProps = Readonly<{
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}>;

function CheckField({ label, checked, onCheckedChange, className }: CheckFieldProps) {
  const id = useId();
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Label htmlFor={id} className="text-sm text-foreground">
        {label}
      </Label>
    </div>
  );
}
