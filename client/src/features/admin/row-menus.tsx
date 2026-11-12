import {
  USER_PLANS,
  type AdminInvitationDto,
  type AdminUserDto,
  type UserPlan,
} from '@lorkarium/contracts';
import { EllipsisIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PLAN_NAMES } from '@/lib/plan-seal';

export type UserRowCommand =
  'password-link' | 'grant-admin' | 'revoke-admin' | 'suspend' | 'reactivate' | 'delete';
export type InvitationRowCommand = 'resend' | 'cancel';

/** The menu at the end of an account row; what it offers follows the account's state. "Plano"
 *  opens the plans with the current one marked.
 *
 *  Example: `<UserRowMenu user={bia} onCommand={(command) => open(command, bia)} onPlan={(plan) => setPlan(bia, plan)} />` */
export function UserRowMenu({
  user,
  onCommand,
  onPlan,
}: Readonly<{
  user: AdminUserDto;
  onCommand: (command: UserRowCommand) => void;
  onPlan: (plan: UserPlan) => void;
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
        <PlanSubmenu current={user.plan} onPlan={onPlan} />
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

type PlanSubmenuProps = Readonly<{ current: UserPlan; onPlan: (plan: UserPlan) => void }>;

function PlanSubmenu({ current, onPlan }: PlanSubmenuProps): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Plano</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={current}>
          {USER_PLANS.map((plan) => (
            <DropdownMenuRadioItem
              key={plan}
              value={plan}
              onSelect={() => {
                if (plan !== current) onPlan(plan);
              }}
            >
              {PLAN_NAMES[plan]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
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
