import { EllipsisIcon, EyeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type PlayerActionsMenuProps = Readonly<{
  /** The account name of the player. */
  name: string;
  disabled: boolean;
  onMoveToSpectators: () => void;
}>;

/** The master's "⋯" on a player's card: "Mover para espectadores" (which asks first, in place).
 *
 *  Example: `<PlayerActionsMenu name="Bia" disabled={false} onMoveToSpectators={ask} />` */
export function PlayerActionsMenu({
  name,
  disabled,
  onMoveToSpectators,
}: PlayerActionsMenuProps): React.JSX.Element {
  return (
    // Not modal: a modal menu traps the focus and pulls back the Cancel's autoFocus of the
    // confirmation that opens as it closes, leaving Esc with nowhere to land.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Mais ações de ${name}`}
          disabled={disabled}
          className="text-muted-foreground"
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      {/* The confirmation that opens in the card takes the focus; going back to "⋯" would steal it. */}
      <DropdownMenuContent
        align="end"
        className="w-56"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem onSelect={onMoveToSpectators}>
          <EyeIcon aria-hidden="true" />
          Mover para espectadores
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
