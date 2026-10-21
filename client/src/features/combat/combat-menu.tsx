import { EllipsisIcon, PlusIcon, SquareIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const EVERYONE_IN_ORDER = 'Todo mundo da cena já está na ordem.';

export type CombatMenuProps = Readonly<{
  disabled: boolean;
  /** Someone of the scene is still out of the order. */
  canAdd: boolean;
  onAdd: () => void;
  onTokenless: () => void;
  onEnd: () => void;
}>;

/** The master's "⋯" of the running combat: "Adicionar ao combate", "Entrada sem token" and, apart,
 *  "Encerrar combate" (which asks first, in place).
 *
 *  Example: `<CombatMenu disabled={readOnly} canAdd onAdd={openAdd} onTokenless={openForm} onEnd={ask} />` */
export function CombatMenu(props: CombatMenuProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Mais opções do combate"
          disabled={props.disabled}
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem disabled={!props.canAdd} onSelect={props.onAdd}>
          <PlusIcon aria-hidden="true" />
          <span className="flex flex-col">
            Adicionar ao combate
            {!props.canAdd && (
              <span className="text-xs text-muted-foreground">{EVERYONE_IN_ORDER}</span>
            )}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={props.onTokenless}>
          <SparklesIcon aria-hidden="true" />
          Entrada sem token
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={props.onEnd}>
          <SquareIcon aria-hidden="true" />
          Encerrar combate
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
