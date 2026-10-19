import type { TokenDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { ChoiceField } from '@/components/choice-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TokenChoices } from './start-combat-dialog';
import type { EntryChoice } from './token-in-combat-menu';

const EACH_ALONE = 'each-alone';

export type AddCombatantsDialogProps = Readonly<{
  /** The tokens of the Tokens layer still out of the combat. */
  tokens: readonly TokenDto[];
  /** The entries of the combat, by label, for "Entrar em". */
  entries: readonly EntryChoice[];
  onAddAlone: (tokenIds: string[]) => void;
  onJoin: (tokenIds: string[], combatantId: string) => void;
  onClose: () => void;
}>;

/** "+ Adicionar ao combate" in the middle of the fight: the tokens out of it, all checked, and
 *  "Entrar em": "Cada um na sua vez" (an entry each) or an entry of the combat.
 *
 *  Example: `<AddCombatantsDialog tokens={outside} entries={labels} onAddAlone={add} onJoin={join} onClose={close} />` */
export function AddCombatantsDialog(props: AddCombatantsDialogProps): React.JSX.Element {
  const { tokens, entries, onAddAlone, onJoin, onClose } = props;
  const [chosen, setChosen] = useState<readonly string[]>(() => tokens.map(({ id }) => id));
  const [target, setTarget] = useState(EACH_ALONE);
  const options = [
    { value: EACH_ALONE, label: 'Cada um na sua vez' },
    ...entries.map(({ id, label }) => ({ value: id, label })),
  ];
  const confirm = (): void => {
    const tokenIds = tokens.filter(({ id }) => chosen.includes(id)).map(({ id }) => id);
    if (target === EACH_ALONE) onAddAlone(tokenIds);
    else onJoin(tokenIds, target);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar ao combate</DialogTitle>
          <DialogDescription>Marque quem entra e em qual vez.</DialogDescription>
        </DialogHeader>
        <TokenChoices tokens={tokens} chosen={chosen} onChosenChange={setChosen} />
        <ChoiceField legend="Entrar em" value={target} options={options} onChange={setTarget} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={chosen.length === 0} onClick={confirm}>
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
