import type { RegroupTargetDto } from '@lorkarium/contracts';
import { EllipsisIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** An entry a token can be moved into, as the tracker reads it. */
export type EntryChoice = Readonly<{ id: string; label: string }>;

export type TokenInCombatMenuProps = Readonly<{
  /** Names the trigger: "Mais ações de Goblin". */
  name: string;
  /** Alone in its entry: "Separar" would change nothing, so it is not offered. */
  alone: boolean;
  /** The other entries of the combat, for "Mover para". */
  others: readonly EntryChoice[];
  disabled: boolean;
  onRegroup: (target: RegroupTargetDto) => void;
}>;

/** The master's menu of one token in the combat: "Separar" (an entry of its own), "Mover para" ›
 *  another entry, and "Tirar do combate" (only this token).
 *
 *  Example: `<TokenInCombatMenu name="Goblin" alone={false} others={entries} disabled={false} onRegroup={send} />` */
export function TokenInCombatMenu(props: TokenInCombatMenuProps): React.JSX.Element {
  const { name, alone, others, disabled, onRegroup } = props;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Mais ações de ${name}`}
          disabled={disabled}
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {!alone && (
          <DropdownMenuItem onSelect={() => onRegroup({ kind: 'own' })}>Separar</DropdownMenuItem>
        )}
        <MoveToEntry others={others} onRegroup={onRegroup} />
        <DropdownMenuItem onSelect={() => onRegroup({ kind: 'out' })}>
          Tirar do combate
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Mover para" › one item per other entry; nothing when there is no other entry.
 *
 *  Example: `<MoveToEntry others={entries} onRegroup={send} />` */
export function MoveToEntry({
  others,
  onRegroup,
}: Readonly<{ others: readonly EntryChoice[]; onRegroup: (target: RegroupTargetDto) => void }>) {
  if (others.length === 0) return null;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Mover para</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        {others.map(({ id, label }) => (
          <DropdownMenuItem key={id} onSelect={() => onRegroup({ kind: 'entry', combatantId: id })}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
