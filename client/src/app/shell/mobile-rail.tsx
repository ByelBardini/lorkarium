import type { AuthUserDto } from '@lorkarium/contracts';
import { MenuIcon } from 'lucide-react';
import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import { RailBrand, RailNav } from './app-rail';
import { OpenTablesNav } from './open-tables-nav';
import { UserMenu } from './user-menu';

export type MobileRailProps = Readonly<{
  openTables: StoreApi<OpenTablesStore>;
  user: AuthUserDto;
  onSignOut: () => Promise<void>;
}>;

/** Below `md`: "Abrir menu" opens the expanded rail as a drawer, which closes on navigation.
 *
 *  Example: `<header className="md:hidden"><MobileRail openTables={openTables} user={user} onSignOut={signOut} /></header>` */
export function MobileRail({ openTables, user, onSignOut }: MobileRailProps): React.JSX.Element {
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
        <OpenTablesNav openTables={openTables} expanded onNavigate={() => setOpen(false)} />
        <div className="mt-auto border-t border-border p-2">
          <UserMenu user={user} expanded onSignOut={onSignOut} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
