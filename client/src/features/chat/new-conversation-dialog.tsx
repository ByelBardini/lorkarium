import {
  CHAT_GROUP_MEMBERS_MAX,
  CHAT_GROUP_NAME_MAX,
  type SessionMemberDto,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { SegmentField } from '@/components/segment-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/user-avatar';
import type { ChatConversationTarget } from '@/lib/chat-conversations';
import { chatContactsOf } from '@/lib/chat-recipients';
import { cn } from '@/lib/utils';
import type { ChatPeople } from './use-chat-people';

export type NewConversationDialogProps = Readonly<{
  people: ChatPeople;
  /** Opens the conversation (nothing is sent: a group reaches the others with its 1st message). */
  onStart: (target: ChatConversationTarget) => void;
  onClose: () => void;
  /** The id a new group is born with (drawn here; the server only checks its members). */
  newGroupId?: () => string;
}>;

type Kind = 'direct' | 'group';

const KINDS = [
  { value: 'direct', label: 'Privado' },
  { value: 'group', label: 'Grupo' },
] as const;

const OFFLINE_MARK = 'offline — não recebe';

/** "Nova conversa": a direct with one person, or a fixed group (a name and its people, the
 *  viewer included). Who is offline shows dimmed: nothing is saved, so they would not receive.
 *
 *  Example: `<NewConversationDialog people={people} onStart={open} onClose={close} />` */
export function NewConversationDialog(props: NewConversationDialogProps): React.JSX.Element {
  const [kind, setKind] = useState<Kind>('direct');
  const contacts = chatContactsOf(props.people.members, props.people.viewerId ?? '');
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>Uma conversa só entre quem você escolher.</DialogDescription>
        </DialogHeader>
        <SegmentField
          legend="Tipo de conversa"
          compact
          value={kind}
          options={KINDS}
          onChange={setKind}
        />
        {kind === 'direct' ? (
          <DirectPicker
            contacts={contacts}
            onPick={(userId) => props.onStart({ kind: 'direct', userId })}
          />
        ) : (
          <GroupForm {...props} contacts={contacts} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Contact = SessionMemberDto;

function DirectPicker(
  props: Readonly<{ contacts: readonly Contact[]; onPick: (userId: string) => void }>,
) {
  return (
    <ul className="flex max-h-72 flex-col overflow-y-auto">
      {props.contacts.map((contact) => (
        <li key={contact.userId}>
          <button
            type="button"
            onClick={() => props.onPick(contact.userId)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left outline-offset-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ContactLine contact={contact} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ContactLine({ contact }: Readonly<{ contact: Contact }>): React.JSX.Element {
  return (
    <span
      className={cn('flex min-w-0 flex-1 items-center gap-2.5', !contact.online && 'opacity-60')}
    >
      <UserAvatar name={contact.name} color={contact.color} avatarId={contact.avatarId} size="sm" />
      <span className="truncate text-sm text-foreground">{contact.name}</span>
      {!contact.online && (
        <span className="ml-auto text-xs text-muted-foreground">{OFFLINE_MARK}</span>
      )}
    </span>
  );
}

type GroupFormProps = NewConversationDialogProps & Readonly<{ contacts: readonly Contact[] }>;

function GroupForm(props: GroupFormProps): React.JSX.Element {
  const nameId = useId();
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const full = chosen.length >= CHAT_GROUP_MEMBERS_MAX - 1;
  const ready = name.trim() !== '' && chosen.length > 0 && props.people.viewerId !== null;
  const create = () => {
    if (!ready || props.people.viewerId === null) return;
    const groupId = (props.newGroupId ?? newRandomId)();
    const memberIds = [props.people.viewerId, ...chosen];
    props.onStart({ kind: 'group', groupId, name: name.trim(), memberIds });
  };
  const toggle = (userId: string, on: boolean) =>
    setChosen((kept) => (on ? [...kept, userId] : kept.filter((id) => id !== userId)));
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={nameId} className="text-[13px] text-label">
        Nome do grupo
      </label>
      <Input
        id={nameId}
        value={name}
        maxLength={CHAT_GROUP_NAME_MAX}
        onChange={(event) => setName(event.target.value)}
      />
      <ul aria-label="Quem entra" className="flex max-h-60 flex-col overflow-y-auto">
        {props.contacts.map((contact) => (
          <GroupMember
            key={contact.userId}
            contact={contact}
            checked={chosen.includes(contact.userId)}
            disabled={full}
            onToggle={toggle}
          />
        ))}
      </ul>
      <DialogFooter>
        <Button size="lg" disabled={!ready} onClick={create}>
          Criar grupo
        </Button>
      </DialogFooter>
    </div>
  );
}

type GroupMemberProps = Readonly<{
  contact: Contact;
  checked: boolean;
  /** The group is full: only the ones in it can still be taken out. */
  disabled: boolean;
  onToggle: (userId: string, on: boolean) => void;
}>;

function GroupMember({ contact, checked, disabled, onToggle }: GroupMemberProps) {
  const id = useId();
  return (
    <li className="flex items-center gap-2.5 px-2 py-1.5">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled && !checked}
        onCheckedChange={(state) => onToggle(contact.userId, state === true)}
      />
      <label htmlFor={id} className="flex min-w-0 flex-1">
        <ContactLine contact={contact} />
      </label>
    </li>
  );
}

function newRandomId(): string {
  return crypto.randomUUID();
}
