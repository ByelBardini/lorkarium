import type { TableRole } from '@lorkarium/game-core';
import { CrownIcon, EllipsisIcon, EyeIcon, UserIcon, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type RoleActionsMenuProps = Readonly<{
  /** The account name of the member. */
  name: string;
  /** The roles offered, in the game-core order (`assignableRolesOf`); empty renders nothing. */
  roles: readonly TableRole[];
  disabled: boolean;
  onPick: (role: TableRole) => void;
}>;

const ROLE_ACTION: Readonly<Record<TableRole, Readonly<{ label: string; Icon: LucideIcon }>>> = {
  master: { label: 'Tornar mestre', Icon: CrownIcon },
  player: { label: 'Mover para jogadores', Icon: UserIcon },
  spectator: { label: 'Mover para espectadores', Icon: EyeIcon },
};

/** The "⋯" on a member of the "Na mesa" tab: one item per role the viewer may give them
 *  ("Tornar mestre", "Mover para jogadores", "Mover para espectadores"); some ask first, in place.
 *
 *  Example: `<RoleActionsMenu name="Bia" roles={['master', 'spectator']} disabled={false} onPick={flow.pick} />` */
export function RoleActionsMenu({
  name,
  roles,
  disabled,
  onPick,
}: RoleActionsMenuProps): React.JSX.Element | null {
  if (roles.length === 0) return null;
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
      {/* The confirmation that opens in the row takes the focus; going back to "⋯" would steal it. */}
      <DropdownMenuContent
        align="end"
        className="w-56"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {roles.map((role) => (
          <RoleItem key={role} role={role} onPick={onPick} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RoleItem({
  role,
  onPick,
}: Readonly<{ role: TableRole; onPick: (role: TableRole) => void }>) {
  const { label, Icon } = ROLE_ACTION[role];
  return (
    <DropdownMenuItem onSelect={() => onPick(role)}>
      <Icon aria-hidden="true" />
      {label}
    </DropdownMenuItem>
  );
}
