import type { AuthUserDto } from '@lorkarium/contracts';
import { LogOutIcon, ShieldIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';

export type HomePageProps = Readonly<{ user: AuthUserDto; onSignOut: () => Promise<void> }>;

/** Signed-in landing (placeholder until campaigns exist): greeting, sign out, backoffice for admins.
 *
 *  Example: `<HomePage user={user} onSignOut={signOut} />` */
export function HomePage({ user, onSignOut }: HomePageProps): React.JSX.Element {
  const [leaving, setLeaving] = useState(false);
  const signOut = async (): Promise<void> => {
    setLeaving(true);
    await onSignOut();
  };
  return (
    <div className="min-h-svh bg-background text-foreground">
      <title>Lorkarium · Início</title>
      <header className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-8">
        <BrandMark variant="compact" />
        <Button variant="outline" size="lg" onClick={signOut} disabled={leaving}>
          <LogOutIcon aria-hidden="true" />
          Sair
        </Button>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16 sm:px-8">
        <h1 className="font-display text-[40px] leading-[1.1] font-semibold">Olá, {user.name}</h1>
        <p className="text-muted-foreground">Suas campanhas vão aparecer aqui.</p>
        {user.role === 'admin' && (
          <Link to="/admin" className="inline-flex w-fit items-center gap-2">
            <ShieldIcon aria-hidden="true" className="size-4" />
            Backoffice
          </Link>
        )}
      </main>
    </div>
  );
}
