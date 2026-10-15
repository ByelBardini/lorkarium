import type { AuthUserDto } from '@lorkarium/contracts';
import { LogOutIcon, ShieldIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type UserMenuProps = Readonly<{
  user: AuthUserDto;
  expanded: boolean;
  onSignOut: () => Promise<void>;
}>;

/** The account menu at the foot of the rail: Backoffice for admins, and "Sair".
 *
 *  Example: `<UserMenu user={user} expanded onSignOut={signOut} />` */
export function UserMenu({ user, expanded, onSignOut }: UserMenuProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn('h-10 text-label', expanded ? 'justify-start px-2' : 'justify-center px-0')}
        >
          <span
            aria-hidden="true"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted font-brand text-xs text-primary"
          >
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className={expanded ? 'truncate' : 'sr-only'}>{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-52">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === 'admin' && (
          <DropdownMenuItem asChild>
            <Link to="/admin" className="text-foreground no-underline hover:no-underline">
              <ShieldIcon aria-hidden="true" />
              Backoffice
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void onSignOut()}>
          <LogOutIcon aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
