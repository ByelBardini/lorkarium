import { KeyRoundIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type HomeActionsProps = Readonly<{ onCreate: () => void; onJoin: () => void }>;

/** "Entrar com código" and "Nova mesa", side by side.
 *
 *  Example: `<HomeActions onCreate={openCreate} onJoin={openJoin} />` */
export function HomeActions({ onCreate, onJoin }: HomeActionsProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="lg" onClick={onJoin}>
        <KeyRoundIcon aria-hidden="true" />
        Entrar com código
      </Button>
      <Button size="lg" onClick={onCreate}>
        <PlusIcon aria-hidden="true" />
        Nova mesa
      </Button>
    </div>
  );
}
