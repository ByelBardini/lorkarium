import {
  SHEET_NAME_MAX_LENGTH,
  createSheetRequestDto,
  type CreateSheetRequestDto,
  type SheetTemplateSummaryDto,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SheetPlayer } from './use-sheet-holder-names';

// Radix Select reserves the empty string for "no value", so "Ninguém" needs a value of its own.
const NOBODY = 'nobody';

export type NewSheetDialogProps = Readonly<{
  folderId: string | null;
  templates: readonly SheetTemplateSummaryDto[];
  players: readonly SheetPlayer[];
  live: boolean;
  /** The request to send; the dialog closes right after (a refusal goes to the status line). */
  onCreate: (request: CreateSheetRequestDto) => void;
  onClose: () => void;
}>;

/** The master's "Nova ficha": a name, a template of the library and, optionally, the player who
 *  gets it ("Ninguém" leaves it to the masters until it is given).
 *
 *  Example: `<NewSheetDialog folderId={null} templates={templates} players={players} live onCreate={send} onClose={close} />` */
export function NewSheetDialog(props: NewSheetDialogProps): React.JSX.Element {
  const ids = { name: useId(), template: useId(), holder: useId() };
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
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogTitle>Nova ficha</DialogTitle>
        <DialogDescription>
          A ficha roda o código de um modelo. Sem dono, só os mestres a veem.
        </DialogDescription>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <label htmlFor={ids.name}>Nome da ficha</label>
          <Input
            id={ids.name}
            maxLength={SHEET_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TemplateField id={ids.template} {...props} value={templateId} onChange={setTemplateId} />
          <label htmlFor={ids.holder}>Dono</label>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger id={ids.holder}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>Ninguém (só mestres)</SelectItem>
              {props.players.map((player) => (
                <SelectItem key={player.userId} value={player.userId}>
                  {player.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={!request.success || !props.live}>
            Criar ficha
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type TemplateFieldProps = Readonly<{
  id: string;
  templates: readonly SheetTemplateSummaryDto[];
  value: string;
  onChange: (templateId: string) => void;
}>;

function TemplateField({ id, templates, value, onChange }: TemplateFieldProps) {
  if (templates.length === 0)
    return <p role="status">Crie um modelo de ficha na biblioteca antes da primeira ficha.</p>;
  return (
    <>
      <label htmlFor={id}>Modelo</label>
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
    </>
  );
}
