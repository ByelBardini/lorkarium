import { SmileIcon } from 'lucide-react';
import { useState } from 'react';
import { EmoteImage } from '@/components/emote-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EMOTES, MEMES, SMILEYS, type Emote } from '@/lib/emote-catalog';
import { searchEmotes } from '@/lib/emote-input';

export type EmotePickerProps = Readonly<{
  /** Gets the code of the picture clicked (the emote's first code). */
  onPick: (code: string) => void;
  disabled?: boolean;
}>;

/** "Memes e smileys": a button beside the message field opening a grid in two tabs, with a
 *  search over codes and names. A click writes the code and closes it; the field takes the
 *  focus back (`onPick`).
 *
 *  Example: `<EmotePicker onPick={(code) => insertAtCaret(code)} disabled={!live} />` */
export function EmotePicker({ onPick, disabled }: EmotePickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const pick = (code: string) => {
    setOpen(false);
    onPick(code);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Memes e smileys"
          title="Memes e smileys"
          disabled={disabled}
          className="text-muted-foreground"
        >
          <SmileIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        aria-label="Memes e smileys"
        className="w-80 max-w-[calc(100vw-2rem)] gap-2 p-3"
        // The field gets the focus back from `onPick`, not the button.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <EmotePickerBody onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}

function EmotePickerBody({ onPick }: Readonly<{ onPick: (code: string) => void }>) {
  const [search, setSearch] = useState('');
  return (
    <>
      <Input
        type="search"
        aria-label="Buscar meme ou smiley"
        placeholder="Buscar: rage, doge, coração…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {search.trim() === '' ? (
        <EmoteTabs onPick={onPick} />
      ) : (
        <EmoteGrid emotes={searchEmotes(EMOTES, search)} onPick={onPick} />
      )}
    </>
  );
}

function EmoteTabs({ onPick }: Readonly<{ onPick: (code: string) => void }>) {
  return (
    <Tabs defaultValue="smileys" className="gap-2">
      <TabsList>
        <TabsTrigger value="smileys">Smileys</TabsTrigger>
        <TabsTrigger value="memes">Memes</TabsTrigger>
      </TabsList>
      <TabsContent value="smileys">
        <EmoteGrid emotes={SMILEYS} onPick={onPick} />
      </TabsContent>
      <TabsContent value="memes">
        <EmoteGrid emotes={MEMES} onPick={onPick} />
      </TabsContent>
    </Tabs>
  );
}

function EmoteGrid({
  emotes,
  onPick,
}: Readonly<{ emotes: readonly Emote[]; onPick: (code: string) => void }>) {
  if (emotes.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">Nada encontrado.</p>;
  }
  return (
    <div className="grid max-h-60 grid-cols-7 gap-1 overflow-y-auto">
      {emotes.map((emote) => (
        <EmoteCell key={emote.id} emote={emote} onPick={onPick} />
      ))}
    </div>
  );
}

function EmoteCell({ emote, onPick }: Readonly<{ emote: Emote; onPick: (code: string) => void }>) {
  const code = emote.codes[0] ?? '';
  return (
    <button
      type="button"
      aria-label={code}
      title={emote.codes.join('  ')}
      onClick={() => onPick(code)}
      className="grid aspect-square place-items-center rounded-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <EmoteImage emote={emote} code={code} sticker={false} decorative className="size-7" />
    </button>
  );
}
