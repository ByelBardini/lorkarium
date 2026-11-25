import { CUSTOM_EMOJI_MIME_TYPES, type CustomEmojiDto } from '@lorkarium/contracts';
import { ImageUpIcon, Loader2Icon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useId, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { customEmojiNameProblem, typedCustomEmojiName } from '@/lib/custom-emoji-text';
import { cn } from '@/lib/utils';
import type { EmojiDraft } from './custom-emoji-draft';

export type CustomEmojiFormProps = Readonly<{
  draft: EmojiDraft;
  /** The picture shown in the square: the one chosen, or the emoji being edited. */
  pictureUrl: string | null;
  /** The emoji loaded from the gallery; `null` makes a new one. */
  editing: CustomEmojiDto | null;
  onDraft: (draft: EmojiDraft) => void;
  onCreate: (name: string, picture: File) => Promise<boolean>;
  onRename: (emojiId: string, name: string) => Promise<boolean>;
  onRemove: (emojiId: string) => Promise<boolean>;
  /** Leaves the emoji being edited: back to a new one. */
  onCancel: () => void;
}>;

const PICTURE_ACCEPT = CUSTOM_EMOJI_MIME_TYPES.join(',');

/** The emoji in the making: a square that takes a dropped or chosen picture and shows it, the name
 *  between colons and the actions. A new one is added; one picked from the gallery is renamed or
 *  removed (its picture stays: to change it, remove and add again).
 *
 *  Example: `<CustomEmojiForm draft={draft} pictureUrl={url} editing={null} … />` */
export function CustomEmojiForm(props: CustomEmojiFormProps): React.JSX.Element {
  const { draft, editing, onDraft } = props;
  const [busy, setBusy] = useState(false);
  const problem = draft.name === '' ? null : customEmojiNameProblem(draft.name);
  const named = draft.name !== '' && problem === null;
  const run = async (work: () => Promise<boolean>): Promise<void> => {
    setBusy(true);
    await work();
    setBusy(false);
  };
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!named) return;
    if (editing !== null) return run(() => props.onRename(editing.id, draft.name));
    const { picture } = draft;
    if (picture !== null) return run(() => props.onCreate(draft.name, picture));
  };
  return (
    <form
      aria-label={editing === null ? 'Novo emoji' : `Editar :${editing.name}:`}
      onSubmit={submit}
      className="flex flex-wrap items-start gap-6"
    >
      <PictureDrop
        url={props.pictureUrl}
        locked={editing !== null}
        onPicture={(picture) => onDraft({ ...draft, picture })}
      />
      <div className="flex min-w-60 flex-1 flex-col gap-4">
        <NameField
          name={draft.name}
          problem={problem}
          onName={(name) => onDraft({ ...draft, name })}
        />
        {editing === null ? (
          <CreateButton busy={busy} ready={named && draft.picture !== null} />
        ) : (
          <EditButtons
            busy={busy}
            renamed={named && draft.name !== editing.name}
            onRemove={() => void run(() => props.onRemove(editing.id))}
            onCancel={props.onCancel}
          />
        )}
      </div>
    </form>
  );
}

function CreateButton({ busy, ready }: Readonly<{ busy: boolean; ready: boolean }>) {
  return (
    <Button type="submit" size="xl" disabled={busy || !ready} className="self-start">
      {busy ? (
        <Loader2Icon aria-hidden="true" className="animate-spin" />
      ) : (
        <PlusIcon aria-hidden="true" />
      )}
      {busy ? 'Enviando…' : 'Adicionar emoji'}
    </Button>
  );
}

type EditButtonsProps = Readonly<{
  busy: boolean;
  renamed: boolean;
  onRemove: () => void;
  onCancel: () => void;
}>;

function EditButtons({ busy, renamed, onRemove, onCancel }: EditButtonsProps) {
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <div role="group" aria-label="Apagar este emoji?" className="flex items-center gap-2">
        <span className="text-sm text-label">Apagar este emoji?</span>
        <Button type="button" variant="destructive" disabled={busy} onClick={onRemove}>
          Apagar
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
          Manter
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="submit" size="xl" disabled={busy || !renamed}>
        Salvar nome
      </Button>
      <Button type="button" size="xl" variant="outline" onClick={() => setAsking(true)}>
        <Trash2Icon aria-hidden="true" />
        Apagar
      </Button>
      <Button type="button" size="xl" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
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

type PictureDropProps = Readonly<{
  url: string | null;
  /** Editing: the picture is shown, not changed. */
  locked: boolean;
  onPicture: (picture: File) => void;
}>;

const PICTURE_FRAME = 'grid size-32 shrink-0 place-items-center rounded-md border bg-card';

function PictureDrop({ url, locked, onPicture }: PictureDropProps): React.JSX.Element {
  const [over, setOver] = useState(false);
  if (locked) {
    return (
      <div className={cn(PICTURE_FRAME, 'border-border')}>
        {url !== null && <img src={url} alt="" className="size-20 object-contain" />}
      </div>
    );
  }
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
        PICTURE_FRAME,
        'cursor-pointer border-dashed text-center transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
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
