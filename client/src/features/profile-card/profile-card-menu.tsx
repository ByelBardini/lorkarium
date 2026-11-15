import type { ProfileCardDto } from '@lorkarium/contracts';
import { BanIcon, EllipsisIcon, FlagIcon, UserMinusIcon, UserPlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** What the ⋯ menu can ask the actions bar to do. */
export type ProfileCardMenuChoice = 'remove' | 'add' | 'accept' | 'unblock' | 'block' | 'report';

export type ProfileCardMenuProps = Readonly<{
  card: ProfileCardDto;
  onChoose: (choice: ProfileCardMenuChoice) => void;
}>;

/** "Mais ações": the friendship step that fits the relation, then "Bloquear" and "Denunciar".
 *
 *  Example: `<ProfileCardMenu card={card} onChoose={run} />` */
export function ProfileCardMenu({ card, onChoose }: ProfileCardMenuProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Mais ações">
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <FriendshipItem relation={card.relation} onChoose={onChoose} />
        {card.relation !== 'blocked' && (
          <DropdownMenuItem variant="destructive" onSelect={() => onChoose('block')}>
            <BanIcon aria-hidden="true" />
            Bloquear
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onSelect={() => onChoose('report')}>
          <FlagIcon aria-hidden="true" />
          Denunciar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const FRIENDSHIP_ITEMS: Readonly<
  Partial<Record<ProfileCardDto['relation'], { choice: ProfileCardMenuChoice; label: string }>>
> = {
  friend: { choice: 'remove', label: 'Desfazer amizade' },
  none: { choice: 'add', label: 'Adicionar amigo' },
  incoming: { choice: 'accept', label: 'Aceitar pedido' },
  blocked: { choice: 'unblock', label: 'Desbloquear' },
};

function FriendshipItem({
  relation,
  onChoose,
}: Readonly<{
  relation: ProfileCardDto['relation'];
  onChoose: (choice: ProfileCardMenuChoice) => void;
}>): React.JSX.Element | null {
  const item = FRIENDSHIP_ITEMS[relation];
  if (!item) return null;
  const Icon = item.choice === 'remove' ? UserMinusIcon : UserPlusIcon;
  return (
    <DropdownMenuItem onSelect={() => onChoose(item.choice)}>
      <Icon aria-hidden="true" />
      {item.label}
    </DropdownMenuItem>
  );
}
