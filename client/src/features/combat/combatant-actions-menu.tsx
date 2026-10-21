import type { RegroupTargetDto } from '@lorkarium/contracts';
import { EllipsisIcon } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { EntryChoice } from '@/lib/combat-rows';
import { MoveToEntry } from './token-in-combat-menu';

export type CombatantActionsMenuProps = Readonly<{
  /** Names the trigger: "Mais ações de Inimigos". */
  label: string;
  /** For an entry of one token, "Mover para" moves that token; otherwise there is none. */
  others: readonly EntryChoice[] | null;
  disabled: boolean;
  onRename: () => void;
  onMoveToken: (target: RegroupTargetDto) => void;
  onRemove: () => void;
}>;

/** The master's menu of one initiative entry: "Renomear", "Mover para" (an entry of one token) and
 *  "Tirar do combate" (the whole entry).
 *
 *  Example: `<CombatantActionsMenu label="Inimigos" others={null} disabled={false} onRename={open} onMoveToken={send} onRemove={remove} />` */
export function CombatantActionsMenu(props: CombatantActionsMenuProps): React.JSX.Element {
  const { label, others, disabled, onRename, onMoveToken, onRemove } = props;
  // "Renomear" puts the focus in the name field; handing it back to the trigger would steal it.
  const renaming = useRef(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Mais ações de ${label}`}
          disabled={disabled}
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-44"
        onCloseAutoFocus={(event) => {
          if (renaming.current) event.preventDefault();
          renaming.current = false;
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            renaming.current = true;
            onRename();
          }}
        >
          Renomear
        </DropdownMenuItem>
        {others && <MoveToEntry others={others} onRegroup={onMoveToken} />}
        <DropdownMenuItem onSelect={onRemove}>Tirar do combate</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
