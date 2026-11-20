import type { MailBroadcastDto } from '@lorkarium/contracts';
import { EyeIcon, Loader2Icon, MailCheckIcon } from 'lucide-react';
import { useId } from 'react';
import { FormField } from '@/components/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { BroadcastsApi } from '@/services/broadcasts-api';
import { broadcastFailureMessage, type BroadcastFields } from './broadcast-messages';
import { BroadcastSendPanel } from './broadcast-send-panel';
import {
  audienceLabel,
  countText,
  SEGMENT_CHOICES,
  segmentLabel,
  segmentOf,
  type SegmentChoice,
} from './broadcast-view';
import { useBroadcastEditor, type BroadcastEditorStatus } from './use-broadcast-editor';

export type BroadcastEditorPanelProps = Readonly<{
  api: BroadcastsApi;
  twoFactorOn: boolean;
  onConfirmed: (broadcast: MailBroadcastDto) => void;
}>;

/** "Novo comunicado": segment, text, the server's preview, a test to the admin and the send.
 *
 *  Example: `<BroadcastEditorPanel api={api} twoFactorOn onConfirmed={add} />` */
export function BroadcastEditorPanel(props: BroadcastEditorPanelProps): React.JSX.Element {
  const editor = useBroadcastEditor(props.api, props.onConfirmed);
  const { status } = editor;
  const busy = status.kind === 'busy';
  return (
    <section aria-labelledby="broadcast-editor" className="flex max-w-2xl flex-col gap-5">
      <h2 id="broadcast-editor" className="font-display text-2xl font-medium">
        Novo comunicado
      </h2>
      <SegmentPicker
        choice={editor.fields.choice}
        onChange={(choice) => editor.change({ choice })}
      />
      <p aria-live="polite" className="min-h-5 text-sm text-foreground">
        {editor.audience === null ? null : audienceLabel(editor.audience)}
      </p>
      <LetterFields fields={editor.fields} onChange={editor.change} />
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          size="lg"
          disabled={busy}
          onClick={() => void editor.showPreview()}
        >
          <EyeIcon aria-hidden="true" />
          Ver prévia
        </Button>
        <Button variant="outline" size="lg" disabled={busy} onClick={() => void editor.sendTest()}>
          {isBusy(status, 'test') ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <MailCheckIcon aria-hidden="true" />
          )}
          {isBusy(status, 'test') ? 'Enviando teste…' : 'Enviar teste para mim'}
        </Button>
      </div>
      <StatusLine status={status} />
      {editor.previewHtml && (
        <iframe
          title="Prévia do e-mail"
          sandbox=""
          srcDoc={editor.previewHtml}
          className="h-[640px] w-full rounded-lg border border-divider bg-white"
        />
      )}
      <BroadcastSendPanel
        audience={editor.audience}
        tested={editor.tested}
        twoFactorOn={props.twoFactorOn}
        busy={isBusy(status, 'confirm')}
        onConfirm={(total) => void editor.confirm(total)}
      />
    </section>
  );
}

function isBusy(status: BroadcastEditorStatus, action: 'preview' | 'test' | 'confirm'): boolean {
  return status.kind === 'busy' && status.action === action;
}

function StatusLine({ status }: Readonly<{ status: BroadcastEditorStatus }>): React.JSX.Element {
  if (status.kind === 'failed' || status.kind === 'invalid') {
    const text =
      status.kind === 'failed' ? broadcastFailureMessage(status.failure) : status.message;
    return (
      <Alert variant="destructive" className="px-3.5 py-3 text-sm">
        {text}
      </Alert>
    );
  }
  return (
    <p role="status" className="min-h-5 text-sm text-foreground">
      {status.kind === 'tested' ? `Teste enviado para ${status.to}.` : null}
      {status.kind === 'confirmed'
        ? `Comunicado confirmado: ${countText(status.total)} e-mails na fila de envio.`
        : null}
    </p>
  );
}

type SegmentPickerProps = Readonly<{
  choice: SegmentChoice;
  onChange: (choice: SegmentChoice) => void;
}>;

function SegmentPicker({ choice, onChange }: SegmentPickerProps): React.JSX.Element {
  const id = useId();
  return (
    <FormField id={id} label="Para quem" error={undefined}>
      <select
        id={id}
        value={choice}
        onChange={(event) => onChange(event.target.value as SegmentChoice)}
        className="h-10 w-full max-w-sm rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/20"
      >
        {SEGMENT_CHOICES.map((option) => (
          <option key={option} value={option}>
            {segmentLabel(segmentOf(option))}
          </option>
        ))}
      </select>
    </FormField>
  );
}

type LetterFieldsProps = Readonly<{
  fields: BroadcastFields;
  onChange: (patch: Partial<BroadcastFields>) => void;
}>;

type TextKey = Exclude<keyof BroadcastFields, 'choice'>;

function LetterFields({ fields, onChange }: LetterFieldsProps): React.JSX.Element {
  const id = useId();
  const field = (key: TextKey, label: string, hint?: string): React.JSX.Element => (
    <FormField id={`${id}-${key}`} label={label} error={undefined} hint={hint}>
      {key === 'text' ? (
        <Textarea
          id={`${id}-${key}`}
          value={fields.text}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      ) : (
        <Input
          id={`${id}-${key}`}
          value={fields[key]}
          onChange={(e) => onChange({ [key]: e.target.value })}
        />
      )}
    </FormField>
  );
  return (
    <div className="flex flex-col gap-4">
      {field('subject', 'Assunto')}
      {field('title', 'Título')}
      {field(
        'text',
        'Texto',
        'Separe os parágrafos com uma linha em branco. O e-mail começa com "Oi, <apelido>!".',
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {field('buttonLabel', 'Texto do botão (opcional)')}
        {field('buttonHref', 'Link do botão (opcional)', 'Começa com https://')}
      </div>
    </div>
  );
}
