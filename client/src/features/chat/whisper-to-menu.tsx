import type { SessionMemberDto } from '@lorkarium/contracts';
import { ChevronDownIcon, LockIcon, UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type WhisperToMenuProps = Readonly<{
  /** Who may be whispered to: everyone but the viewer (`chatContactsOf`). */
  contacts: readonly Pick<SessionMemberDto, 'userId' | 'name'>[];
  /** `null` = the whole Table. */
  whisperTo: string | null;
  onChange: (whisperTo: string | null) => void;
  disabled: boolean;
}>;

const WHOLE_TABLE = 'Pra toda a mesa';

// The radio value of "the whole Table": a user id never is this.
const ALL = 'all';

/** "Pra quem" of the Table: the whole Table, or a whisper to one person (only the two read it).
 *
 *  Example: `<WhisperToMenu contacts={contacts} whisperTo={null} onChange={setWhisperTo} disabled={false} />` */
export function WhisperToMenu(props: WhisperToMenuProps): React.JSX.Element {
  const chosen = props.contacts.find((each) => each.userId === props.whisperTo) ?? null;
  const shown = chosen ? `Sussurro pra ${chosen.name}` : WHOLE_TABLE;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={props.disabled}>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Pra quem: ${shown}`}
          className={chosen ? 'border-chart-2/60 text-chart-2' : undefined}
        >
          {chosen ? <LockIcon aria-hidden="true" /> : <UsersIcon aria-hidden="true" />}
          <span className="max-w-36 truncate">{shown}</span>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start" side="top">
        <DropdownMenuRadioGroup
          value={props.whisperTo ?? ALL}
          onValueChange={(value) => props.onChange(value === ALL ? null : value)}
        >
          <DropdownMenuRadioItem value={ALL}>{WHOLE_TABLE}</DropdownMenuRadioItem>
          {props.contacts.map((contact) => (
            <DropdownMenuRadioItem key={contact.userId} value={contact.userId}>
              Sussurrar pra {contact.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
