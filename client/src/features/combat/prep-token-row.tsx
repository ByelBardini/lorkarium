import type { SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import { Checkbox } from '@/components/ui/checkbox';
import { playedByText } from '@/lib/played-by';
import { cn } from '@/lib/utils';
import { TokenAvatar } from '@/features/tokens/token-avatar';
import { PrepInitiativeField } from './prep-initiative-field';

export type PrepTokenRowProps = Readonly<{
  token: TokenDto;
  members: readonly SessionMemberDto[];
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  initiative: string;
  onInitiativeChange: (text: string) => void;
  /** A member under its group ("Cada um"): smaller and indented. */
  member?: boolean;
}>;

/** One token while preparing: "Incluir Kael", its face, who plays it ("jogado por Bia" or "NPC")
 *  and its initiative. Left out, the line fades but stays editable.
 *
 *  Example: `<PrepTokenRow token={kael} members={members} checked onCheckedChange={toggle} initiative="18" onInitiativeChange={type} />` */
export function PrepTokenRow(props: PrepTokenRowProps): React.JSX.Element {
  const { token, checked, member = false } = props;
  return (
    <li className={cn('flex items-center gap-3 py-2', member && 'pl-8', !checked && 'opacity-50')}>
      <Checkbox
        aria-label={`Incluir ${token.name}`}
        checked={checked}
        onCheckedChange={(next) => props.onCheckedChange(next === true)}
      />
      <TokenAvatar token={token} size={member ? 'sm' : 'md'} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{token.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {playedByText(token, props.members)}
        </span>
      </span>
      <PrepInitiativeField
        name={token.name}
        text={props.initiative}
        onChange={props.onInitiativeChange}
      />
    </li>
  );
}
