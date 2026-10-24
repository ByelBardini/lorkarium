import type { AdminInvitationDto, AdminUserDto } from '@lorkarium/contracts';
import { EllipsisIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type UserRowCommand =
  'password-link' | 'grant-admin' | 'revoke-admin' | 'suspend' | 'reactivate' | 'delete';
export type InvitationRowCommand = 'resend' | 'cancel';

/** The menu at the end of an account row; what it offers follows the account's state.
 *
 *  Example: `<UserRowMenu user={bia} onCommand={(command) => open(command, bia)} />` */
export function UserRowMenu({
  user,
  onCommand,
}: Readonly<{
  user: AdminUserDto;
  onCommand: (command: UserRowCommand) => void;
}>): React.JSX.Element {
  const active = user.status === 'active';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Ações de ${user.name}`}>
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {active && (
          <DropdownMenuItem onSelect={() => onCommand('password-link')}>
            Mandar link de nova senha
          </DropdownMenuItem>
        )}
        {user.role === 'admin' ? (
          <DropdownMenuItem onSelect={() => onCommand('revoke-admin')}>
            Tirar acesso de admin
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onCommand('grant-admin')}>
            Tornar admin
          </DropdownMenuItem>
        )}
        {active ? (
          <DropdownMenuItem onSelect={() => onCommand('suspend')}>
            Suspender acesso
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onCommand('reactivate')}>
            Reativar acesso
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onCommand('delete')}>
          Excluir usuário
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The menu at the end of an invitation row: resend (also when expired) or cancel.
 *
 *  Example: `<InvitationRowMenu invitation={marina} onCommand={(command) => open(command, marina)} />` */
export function InvitationRowMenu({
  invitation,
  onCommand,
}: Readonly<{
  invitation: AdminInvitationDto;
  onCommand: (command: InvitationRowCommand) => void;
}>): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Ações do convite para ${invitation.email}`}
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onCommand('resend')}>Reenviar convite</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => onCommand('cancel')}>
          Cancelar convite
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
