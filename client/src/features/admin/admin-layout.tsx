import type { AuthUserDto } from '@lorkarium/contracts';
import { ArrowLeftIcon, MailIcon, UsersIcon } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { BrandMark } from '@/components/brand-mark';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import { ROLE_LABEL } from './admin-messages';

/** The backoffice's own frame: brand + "Backoffice", the navigation (only "Usuários" for now),
 *  "Voltar para o app" and who is signed in; under `md` the side becomes a strip on top.
 *
 *  Example: `<AdminLayout user={session.user} />` */
export function AdminLayout({ user }: Readonly<{ user: AuthUserDto }>): React.JSX.Element {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground md:flex-row">
      <aside className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border bg-panel px-4 py-3 md:w-60 md:flex-col md:flex-nowrap md:items-stretch md:gap-6 md:border-r md:border-b-0 md:px-3 md:py-6">
        <div className="flex items-center gap-3 md:px-2">
          <BrandMark variant="icon" className="size-7" />
          <div className="flex flex-col">
            <span className="font-brand text-sm font-semibold tracking-[0.28em]">LORKARIUM</span>
            <span className="text-[10px] font-bold tracking-[0.2em] text-primary uppercase">
              Backoffice
            </span>
          </div>
        </div>
        <AdminNav />
        <div className="ml-auto flex items-center gap-3 md:mt-auto md:ml-0 md:flex-col md:items-stretch">
          <Link
            to="/"
            className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground no-underline hover:text-foreground hover:no-underline"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            Voltar para o app
          </Link>
          <SignedInAdmin user={user} />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}

function AdminNav(): React.JSX.Element {
  return (
    <nav aria-label="Backoffice" className="flex md:flex-col">
      <AdminNavLink to="/admin/users" icon={UsersIcon} label="Usuários" />
      <AdminNavLink to="/admin/emails" icon={MailIcon} label="E-mails" />
    </nav>
  );
}

function AdminNavLink({
  to,
  icon: Icon,
  label,
}: Readonly<{ to: string; icon: typeof UsersIcon; label: string }>): React.JSX.Element {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-10 items-center gap-3 border-l-2 px-3 text-sm font-medium no-underline hover:text-foreground hover:no-underline',
          isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
        )
      }
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </NavLink>
  );
}

function SignedInAdmin({ user }: Readonly<{ user: AuthUserDto }>): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 md:px-2">
      <UserAvatar name={user.name} color={user.color} avatarId={user.avatarId} size="sm" />
      <div className="hidden min-w-0 flex-col sm:flex">
        <span className="truncate text-sm font-semibold">{user.name}</span>
        <span className="text-[11px] font-semibold tracking-[0.12em] text-primary uppercase">
          {ROLE_LABEL[user.role]}
        </span>
      </div>
    </div>
  );
}
