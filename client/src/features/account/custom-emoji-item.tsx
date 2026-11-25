import type { CustomEmojiDto } from '@lorkarium/contracts';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { CustomEmojiImage } from '@/components/emote-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { customEmojiNameProblem, typedCustomEmojiName } from '@/lib/custom-emoji-text';
import { cn } from '@/lib/utils';

export type CustomEmojiItemProps = Readonly<{
  emoji: CustomEmojiDto;
  /** The plan's ceiling, for the line of an inactive one. */
  limit: number | null;
  onRename: (emojiId: string, name: string) => Promise<boolean>;
  onRemove: (emojiId: string) => Promise<boolean>;
}>;

type Mode = 'view' | 'rename' | 'remove';

/** One emoji of the account: its picture and `:name:`, "Inativo" past the plan's ceiling, and
 *  renaming or removing it (removing asks first).
 *
 *  Example: `<CustomEmojiItem emoji={emoji} limit={10} onRename={rename} onRemove={remove} />` */
export function CustomEmojiItem(props: CustomEmojiItemProps): React.JSX.Element {
  const { emoji } = props;
  const [mode, setMode] = useState<Mode>('view');
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-md border border-divider p-2',
        !emoji.active && 'opacity-60',
      )}
    >
      <CustomEmojiImage emojiId={emoji.id} code={`:${emoji.name}:`} sticker className="size-10" />
      {mode === 'rename' ? (
        <RenameField {...props} onDone={() => setMode('view')} />
      ) : (
        <EmojiName emoji={emoji} limit={props.limit} />
      )}
      {mode === 'view' && <ItemButtons name={emoji.name} onMode={setMode} />}
      {mode === 'remove' && <RemoveQuestion {...props} onCancel={() => setMode('view')} />}
    </li>
  );
}

function EmojiName({ emoji, limit }: Readonly<{ emoji: CustomEmojiDto; limit: number | null }>) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-mono text-sm">:{emoji.name}:</span>
      {!emoji.active && (
        <span className="text-xs text-muted-foreground">
          Inativo — seu plano permite até {limit ?? 0}
        </span>
      )}
    </span>
  );
}

function ItemButtons({ name, onMode }: Readonly<{ name: string; onMode: (mode: Mode) => void }>) {
  return (
    <span className="flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Renomear :${name}:`}
        onClick={() => onMode('rename')}
      >
        <PencilIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Apagar :${name}:`}
        onClick={() => onMode('remove')}
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
    </span>
  );
}

function RenameField(props: CustomEmojiItemProps & Readonly<{ onDone: () => void }>) {
  const [name, setName] = useState(props.emoji.name);
  const problem = customEmojiNameProblem(name);
  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (problem !== null) return;
    if (name === props.emoji.name || (await props.onRename(props.emoji.id, name))) props.onDone();
  };
  return (
    <form onSubmit={save} className="flex flex-1 items-center gap-2">
      <Input
        aria-label={`Novo nome de :${props.emoji.name}:`}
        value={name}
        maxLength={32}
        aria-invalid={problem !== null}
        title={problem ?? undefined}
        onChange={(event) => setName(typedCustomEmojiName(event.target.value))}
        className="w-40 font-mono"
        autoFocus
      />
      <Button type="submit" size="sm" disabled={problem !== null}>
        Salvar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={props.onDone}>
        Cancelar
      </Button>
    </form>
  );
}

function RemoveQuestion(props: CustomEmojiItemProps & Readonly<{ onCancel: () => void }>) {
  return (
    <span
      role="group"
      aria-label={`Apagar :${props.emoji.name}:?`}
      className="flex items-center gap-2"
    >
      <span className="text-sm">Apagar?</span>
      <Button size="sm" variant="destructive" onClick={() => void props.onRemove(props.emoji.id)}>
        Apagar
      </Button>
      <Button size="sm" variant="ghost" onClick={props.onCancel}>
        Manter
      </Button>
    </span>
  );
}
