import {
  SHEET_NAME_MAX_LENGTH,
  createSheetRequestDto,
  type CreateSheetRequestDto,
  type SheetTemplateSummaryDto,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NameField, NewItemFooter } from './new-item-fields';
import type { SheetPlayer } from './use-sheet-holder-names';

// Radix Select reserves the empty string for "no value", so "Ninguém" needs a value of its own.
const NOBODY = 'nobody';

export type NewSheetFormProps = Readonly<{
  folderId: string | null;
  templates: readonly SheetTemplateSummaryDto[];
  players: readonly SheetPlayer[];
  live: boolean;
  /** The request to send; the dialog closes right after (a refusal goes to the status line). */
  onCreate: (request: CreateSheetRequestDto) => void;
  onClose: () => void;
}>;

/** The "Ficha" of "Novo item": a name, a template of the library and, optionally, the player who
 *  gets it ("Ninguém" leaves it to the masters until it is given).
 *
 *  Example: `<NewSheetForm folderId={null} templates={templates} players={players} live onCreate={send} onClose={close} />` */
export function NewSheetForm(props: NewSheetFormProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState(props.templates[0]?.id ?? '');
  const [memberId, setMemberId] = useState(NOBODY);
  const request = createSheetRequestDto.safeParse({
    actionId: crypto.randomUUID(),
    templateId,
    name,
    folderId: props.folderId,
    ...(memberId === NOBODY ? {} : { holder: { memberId } }),
  });
  const send = (): void => {
    if (!request.success || !props.live) return;
    props.onCreate(request.data);
    props.onClose();
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <NameField value={name} onChange={setName} maxLength={SHEET_NAME_MAX_LENGTH} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TemplateField templates={props.templates} value={templateId} onChange={setTemplateId} />
        <HolderField players={props.players} value={memberId} onChange={setMemberId} />
      </div>
      <NewItemFooter canCreate={request.success && props.live} onCancel={props.onClose} />
    </form>
  );
}

type TemplateFieldProps = Readonly<{
  templates: readonly SheetTemplateSummaryDto[];
  value: string;
  onChange: (templateId: string) => void;
}>;

function TemplateField({ templates, value, onChange }: TemplateFieldProps) {
  const id = useId();
  if (templates.length === 0)
    return <p role="status">Crie um modelo de ficha na biblioteca antes da primeira ficha.</p>;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>Modelo</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type HolderFieldProps = Readonly<{
  players: readonly SheetPlayer[];
  value: string;
  onChange: (memberId: string) => void;
}>;

function HolderField({ players, value, onChange }: HolderFieldProps) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>Dono</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOBODY}>Ninguém (só mestres)</SelectItem>
          {players.map((player) => (
            <SelectItem key={player.userId} value={player.userId}>
              {player.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
