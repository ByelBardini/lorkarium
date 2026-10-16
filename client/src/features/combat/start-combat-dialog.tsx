import type { TokenDto } from '@lorkarium/contracts';
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

export type StartCombatDialogProps = Readonly<{
  /** The tokens to choose from (the scene's, or the ones not in the combat yet). */
  tokens: readonly TokenDto[];
  title: string;
  confirmLabel: string;
  onConfirm: (tokenIds: string[]) => void;
  onClose: () => void;
}>;

/** "Iniciar combate" / "+ Adicionar ao combate": the tokens, all checked, in the order they enter.
 *
 *  Example: `<StartCombatDialog tokens={sceneTokens} title="Iniciar combate" confirmLabel="Iniciar" onConfirm={start} onClose={close} />` */
export function StartCombatDialog(props: StartCombatDialogProps): React.JSX.Element {
  const { tokens, title, confirmLabel, onConfirm, onClose } = props;
  const [chosen, setChosen] = useState<readonly string[]>(() => tokens.map(({ id }) => id));
  const toggle = (tokenId: string, checked: boolean): void =>
    setChosen((current) =>
      checked ? [...current, tokenId] : current.filter((id) => id !== tokenId),
    );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Marque quem entra. A ordem segue a iniciativa.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {tokens.map((token) => (
            <TokenChoice
              key={token.id}
              token={token}
              checked={chosen.includes(token.id)}
              onCheckedChange={(checked) => toggle(token.id, checked)}
            />
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={chosen.length === 0}
            onClick={() =>
              onConfirm(tokens.filter(({ id }) => chosen.includes(id)).map(({ id }) => id))
            }
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TokenChoiceProps = Readonly<{
  token: TokenDto;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}>;

function TokenChoice({ token, checked, onCheckedChange }: TokenChoiceProps): React.JSX.Element {
  const id = useId();
  return (
    <li className="flex items-center gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Label htmlFor={id} className="text-sm text-foreground">
        {token.name}
      </Label>
    </li>
  );
}
