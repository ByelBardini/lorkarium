import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The master's golden "Novo" of the library's top line: opens "Novo item" at the root.
 *
 *  Example: `<NewItemButton live={live} onClick={() => newItem.open(null)} />` */
export function NewItemButton({ live, onClick }: Readonly<{ live: boolean; onClick: () => void }>) {
  return (
    <Button size="sm" disabled={!live} className="gap-1.5" onClick={onClick}>
      <PlusIcon aria-hidden="true" />
      Novo
    </Button>
  );
}
