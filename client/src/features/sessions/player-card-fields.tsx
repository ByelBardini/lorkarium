import { CHARACTER_NAME_MAX, type CharacterChangesInput } from '@lorkarium/contracts';
import { PencilIcon, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { digitsOnly } from '@/lib/numeric-text';
import { useDraftField } from '@/lib/use-draft-field';

/** What the fields of one card may do: `editable` (its player or a master), `disabled` while
 *  reconnecting, the id of the "how to save" hint, and the command that saves a change. */
export type CardEditing = Readonly<{
  editable: boolean;
  disabled: boolean;
  hintId: string;
  send: (changes: CharacterChangesInput) => Promise<boolean>;
}>;

/** The words the screen reader hears on an editable field: there is no save button. */
export const SAVE_HINT = 'Enter ou sair do campo salva; Esc desfaz.';

function textChange(draft: string): string | null {
  const trimmed = draft.trim();
  return trimmed === '' ? null : trimmed;
}

function statChange(draft: string): number | null {
  return draft === '' ? null : Number(draft);
}

function fieldAccess(editing: CardEditing) {
  return {
    readOnly: !editing.editable,
    disabled: editing.disabled,
    'aria-describedby': editing.editable ? editing.hintId : undefined,
  };
}

export type StatFieldProps = Readonly<{
  icon: LucideIcon;
  short: 'CA' | 'CD';
  title: string;
  field: 'armorClass' | 'difficultyClass';
  value: number | null;
  owner: string;
  editing: CardEditing;
}>;

/** CA or CD: a whole number from 0 to 999, or empty; letters never get in.
 *
 *  Example: `<StatField icon={ShieldIcon} short="CA" field="armorClass" value={15} … />` */
export function StatField({
  icon: Icon,
  short,
  title,
  field,
  value,
  owner,
  editing,
}: StatFieldProps) {
  const binding = useDraftField({
    confirmed: value === null ? '' : String(value),
    normalize: digitsOnly,
    save: (draft) => editing.send({ [field]: statChange(draft) }),
  });
  return (
    <label
      title={title}
      className="flex h-8.5 items-center gap-1.5 rounded-md border border-divider bg-background pr-1 pl-2 focus-within:border-primary"
    >
      <Icon aria-hidden="true" className="size-4 text-primary" />
      <span
        aria-hidden="true"
        className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground"
      >
        {short}
      </span>
      <input
        aria-label={`${short} de ${owner}`}
        inputMode="numeric"
        maxLength={3}
        placeholder="—"
        {...fieldAccess(editing)}
        {...binding}
        className="h-7 w-8 bg-transparent text-center font-display text-xl font-semibold tabular-nums outline-none placeholder:text-placeholder read-only:cursor-default disabled:opacity-50"
      />
    </label>
  );
}

export type NoteFieldProps = Readonly<{
  label: string;
  field: 'noteOne' | 'noteTwo';
  value: string | null;
  placeholder: string;
  editing: CardEditing;
}>;

/** One of the two free lines of the card, up to 80 characters.
 *
 *  Example: `<NoteField label="Anotação 1 de Lyra" field="noteOne" value={null} … />` */
export function NoteField({ label, field, value, placeholder, editing }: NoteFieldProps) {
  const binding = useDraftField({
    confirmed: value ?? '',
    save: (draft) => editing.send({ [field]: textChange(draft) }),
  });
  return (
    <input
      aria-label={label}
      maxLength={80}
      placeholder={editing.editable ? placeholder : ''}
      {...fieldAccess(editing)}
      {...binding}
      className="h-7.5 w-full border-0 border-b border-dashed border-input bg-transparent px-0.5 text-[13px] text-label outline-none placeholder:text-placeholder placeholder:italic read-only:cursor-default read-only:border-solid read-only:border-divider focus:border-solid focus:border-primary disabled:opacity-50"
    />
  );
}

export type CharacterNameProps = Readonly<{
  titleId: string;
  /** The character's name, or "Sem personagem" while there is none. */
  shown: string;
  editing: CardEditing;
}>;

/** The character's name: the heading, and the pencil that turns it into "Nome do personagem"
 *  (Enter or leaving saves it; an empty name is never sent and the name stays; Esc keeps it).
 *
 *  Example: `<CharacterName titleId={id} shown="Lyra" editing={editing} />` */
export function CharacterName(props: CharacterNameProps) {
  const [open, setOpen] = useState(false);
  if (open) return <NameInput {...props} onClose={() => setOpen(false)} />;
  return (
    <div className="flex min-h-8 items-center gap-1">
      <h3
        id={props.titleId}
        className="truncate font-display text-[21px] leading-tight font-semibold text-foreground"
      >
        {props.shown}
      </h3>
      {props.editing.editable && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Mudar o nome de ${props.shown}`}
          title="Mudar o nome do personagem"
          disabled={props.editing.disabled}
          onClick={() => setOpen(true)}
          className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        >
          <PencilIcon aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

// A character always has a name: an empty one goes back to the confirmed, nothing sent.
function nameChange(draft: string, editing: CardEditing): Promise<boolean> {
  const name = textChange(draft);
  return name === null ? Promise.resolve(false) : editing.send({ name });
}

function NameInput(props: CharacterNameProps & Readonly<{ onClose: () => void }>) {
  const { editing, onClose } = props;
  const binding = useDraftField({
    confirmed: props.shown,
    save: (draft) => nameChange(draft, editing),
  });
  return (
    <input
      aria-label="Nome do personagem"
      aria-describedby={editing.hintId}
      maxLength={CHARACTER_NAME_MAX}
      placeholder={props.shown}
      autoFocus
      {...binding}
      onBlur={() => {
        binding.onBlur();
        onClose();
      }}
      className="h-8 w-full rounded-md border border-primary bg-background px-2 font-display text-[19px] font-semibold text-foreground outline-none focus:ring-3 focus:ring-ring/20"
    />
  );
}
