import { EllipsisIcon, ShieldAlertIcon, ShieldOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useJuggernautMode, type JuggernautModeDeps } from './use-juggernaut-mode';

/** "Mais ações da mesa" in the room header: for an admin who does not own the table, "Ativar
 *  modo juggernaut" or, once on, "Sair do modo juggernaut". Nothing at all for anyone else.
 *
 *  Example: `<RoomMoreMenu campaign={campaign} reader={user} openTables={openTables} interaction={interaction} />` */
export function RoomMoreMenu(props: JuggernautModeDeps): React.JSX.Element | null {
  const mode = useJuggernautMode(props);
  if (!mode) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Mais ações da mesa"
          disabled={mode.pending}
          className="text-muted-foreground"
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={mode.toggle} className="text-destructive-text">
          {mode.on ? <ShieldOffIcon aria-hidden="true" /> : <ShieldAlertIcon aria-hidden="true" />}
          {mode.on ? 'Sair do modo juggernaut' : 'Ativar modo juggernaut'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
