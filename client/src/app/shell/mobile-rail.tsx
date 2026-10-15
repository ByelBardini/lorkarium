import type { AuthUserDto } from '@lorkarium/contracts';
import { MenuIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { RailBrand, RailNav } from './app-rail';
import { UserMenu } from './user-menu';

export type MobileRailProps = Readonly<{ user: AuthUserDto; onSignOut: () => Promise<void> }>;

/** Below `md`: "Abrir menu" opens the expanded rail as a drawer, which closes on navigation.
 *
 *  Example: `<header className="md:hidden"><MobileRail user={user} onSignOut={signOut} /></header>` */
export function MobileRail({ user, onSignOut }: MobileRailProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir menu">
          <MenuIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined} className="w-56 gap-0 bg-panel p-0">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <RailBrand expanded />
        <RailNav expanded onNavigate={() => setOpen(false)} />
        <div className="mt-auto border-t border-border p-2">
          <UserMenu user={user} expanded onSignOut={onSignOut} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
