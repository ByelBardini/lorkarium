import type { AdminBadgeDto } from '@lorkarium/contracts';
import { EllipsisIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type BadgeRowCommand = 'edit' | 'image' | 'delete';

/** The menu at the end of a catalog row: edit the texts, send or change the image, delete.
 *
 *  Example: `<BadgeRowMenu badge={veteran} onCommand={(command) => open(command, veteran)} />` */
export function BadgeRowMenu({
  badge,
  onCommand,
}: Readonly<{
  badge: AdminBadgeDto;
  onCommand: (command: BadgeRowCommand) => void;
}>): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Ações de ${badge.name}`}>
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onCommand('edit')}>Editar</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCommand('image')}>
          {badge.imageId === null ? 'Enviar imagem' : 'Trocar imagem'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onCommand('delete')}>
          Excluir insígnia
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
