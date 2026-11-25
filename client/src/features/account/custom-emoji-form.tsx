import { CUSTOM_EMOJI_MIME_TYPES } from '@lorkarium/contracts';
import { ImageUpIcon, Loader2Icon, PlusIcon } from 'lucide-react';
import { useId, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { customEmojiNameProblem, typedCustomEmojiName } from '@/lib/custom-emoji-text';
import { cn } from '@/lib/utils';
import type { EmojiDraft } from './custom-emoji-draft';

export type CustomEmojiFormProps = Readonly<{
  draft: EmojiDraft;
  /** The `blob:` URL of the chosen picture, for the drop area. */
  pictureUrl: string | null;
  onDraft: (draft: EmojiDraft) => void;
  /** Answers whether the server kept it; on yes the section clears the draft. */
  onCreate: (name: string, picture: File) => Promise<boolean>;
}>;

const PICTURE_ACCEPT = CUSTOM_EMOJI_MIME_TYPES.join(',');

/** "Novo emoji": a square that takes a dropped or chosen picture and shows it, the name between
 *  colons and "Adicionar emoji".
 *
 *  Example: `<CustomEmojiForm draft={draft} pictureUrl={url} onDraft={setDraft} onCreate={create} />` */
export function CustomEmojiForm(props: CustomEmojiFormProps): React.JSX.Element {
  const { draft, onDraft } = props;
  const [sending, setSending] = useState(false);
  const problem = draft.name === '' ? null : customEmojiNameProblem(draft.name);
  const ready = draft.picture !== null && draft.name !== '' && problem === null;
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!ready || draft.picture === null) return;
    setSending(true);
    await props.onCreate(draft.name, draft.picture);
    setSending(false);
  };
  return (
    <form aria-label="Novo emoji" onSubmit={submit} className="flex flex-wrap items-start gap-6">
      <PictureDrop url={props.pictureUrl} onPicture={(picture) => onDraft({ ...draft, picture })} />
      <div className="flex min-w-60 flex-1 flex-col gap-4">
        <NameField
          name={draft.name}
          problem={problem}
          onName={(name) => onDraft({ ...draft, name })}
        />
        <Button type="submit" size="xl" disabled={sending || !ready} className="self-start">
          {sending ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <PlusIcon aria-hidden="true" />
          )}
          {sending ? 'Enviando…' : 'Adicionar emoji'}
        </Button>
      </div>
    </form>
  );
}

type NameFieldProps = Readonly<{
  name: string;
  problem: string | null;
  onName: (name: string) => void;
}>;

function NameField({ name, problem, onName }: NameFieldProps): React.JSX.Element {
  const id = useId();
  const problemId = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Nome</Label>
      <div className="flex max-w-80 items-center rounded-md border border-input bg-card font-mono text-[15px] focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/20">
        <span aria-hidden="true" className="pl-4 text-muted-foreground">
          :
        </span>
        <Input
          id={id}
          value={name}
          maxLength={32}
          placeholder="festa"
          aria-invalid={problem !== null}
          aria-describedby={problem !== null ? problemId : undefined}
          onChange={(event) => onName(typedCustomEmojiName(event.target.value))}
          className="border-0 bg-transparent pr-4 pl-1 font-mono focus-visible:ring-0"
        />
      </div>
      {problem !== null ? (
        <p id={problemId} role="alert" className="text-sm text-destructive-text">
          {problem}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          No chat você escreve <span className="font-mono text-label">:{name || 'festa'}:</span>
        </p>
      )}
    </div>
  );
}

type PictureDropProps = Readonly<{ url: string | null; onPicture: (picture: File) => void }>;

function PictureDrop({ url, onPicture }: PictureDropProps): React.JSX.Element {
  const [over, setOver] = useState(false);
  const drop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) onPicture(file);
  };
  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        'grid size-32 shrink-0 cursor-pointer place-items-center rounded-md border border-dashed bg-card text-center transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
        over ? 'border-primary bg-primary/10' : 'border-input hover:border-primary',
      )}
    >
      {url === null ? <DropHint /> : <img src={url} alt="" className="size-20 object-contain" />}
      <input
        type="file"
        accept={PICTURE_ACCEPT}
        aria-label={url === null ? 'Escolher imagem' : 'Trocar imagem'}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPicture(file);
        }}
      />
    </label>
  );
}

function DropHint(): React.JSX.Element {
  return (
    <span className="flex flex-col items-center gap-2 px-3 text-xs text-muted-foreground">
      <ImageUpIcon aria-hidden="true" className="size-6 text-label" />
      Arraste ou escolha a imagem
    </span>
  );
}
