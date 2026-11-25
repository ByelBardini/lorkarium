import { SmileIcon } from 'lucide-react';
import { useState } from 'react';
import { OwnEmojiGrid } from '@/components/custom-emojis/own-emoji-grid';
import { useCustomEmojisStore } from '@/components/custom-emojis/use-custom-emojis-store';
import { CustomEmojiImage, EmoteImage } from '@/components/emote-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  EMOTE_CATEGORIES,
  EMOTES,
  emotesIn,
  type CustomEmojiDto,
  type Emote,
  type EmoteCategory,
} from '@lorkarium/contracts';
import { searchEmotes } from '@/lib/emote-input';
import { activeCustomEmojisOf, useCustomEmojis } from '@/stores/custom-emojis-store';

export type EmotePickerProps = Readonly<{
  /** Gets the code of the picture clicked (the emote's first code). */
  onPick: (code: string) => void;
  disabled?: boolean;
}>;

/** "Memes e smileys": a button beside the message field opening a grid in one tab per category, with a
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

// The account's active emojis, from the provider around the chat (none outside one).
function useOwnEmojis(): readonly CustomEmojiDto[] {
  const store = useCustomEmojisStore();
  return activeCustomEmojisOf(useCustomEmojis(store, (state) => state.list));
}

function EmotePickerBody({ onPick }: Readonly<{ onPick: (code: string) => void }>) {
  const [search, setSearch] = useState('');
  const own = useOwnEmojis();
  const typed = search.trim().toLowerCase();
  return (
    <>
      <Input
        type="search"
        aria-label="Buscar meme ou smiley"
        placeholder="Buscar: rage, doge, coração…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {typed === '' ? (
        <EmoteTabs own={own} onPick={onPick} />
      ) : (
        <SearchResults
          own={own.filter((emoji) => emoji.name.includes(typed))}
          search={search}
          onPick={onPick}
        />
      )}
    </>
  );
}

// Each tab is drawn as one of its pictures: six words would not fit the popover.
const CATEGORY_TABS: Readonly<Record<EmoteCategory, { label: string; iconId: string }>> = {
  reactions: { label: 'Reações', iconId: 'smile' },
  gestures: { label: 'Gestos', iconId: 'thumbs-up' },
  rpg: { label: 'RPG', iconId: 'dice' },
  symbols: { label: 'Símbolos', iconId: 'heart' },
  monkeys: { label: 'Macacos', iconId: 'see_no_evil' },
  memes: { label: 'Memes', iconId: 'doge' },
};

type PickerPartProps = Readonly<{
  own: readonly CustomEmojiDto[];
  onPick: (code: string) => void;
}>;

function SearchResults({ own, search, onPick }: PickerPartProps & Readonly<{ search: string }>) {
  const catalog = searchEmotes(EMOTES, search);
  if (own.length === 0) return <EmoteGrid emotes={catalog} onPick={onPick} />;
  return (
    <>
      <OwnEmojiGrid emojis={own} onPick={onPick} />
      {catalog.length > 0 && <EmoteGrid emotes={catalog} onPick={onPick} />}
    </>
  );
}

// "Meus" comes first, and opens first, when the account has emojis of its own.
function EmoteTabs({ own, onPick }: PickerPartProps) {
  const [first] = own;
  return (
    <Tabs defaultValue={first === undefined ? 'reactions' : 'mine'} className="gap-2">
      <TabsList className="w-full">
        {first !== undefined && <OwnTab emojiId={first.id} />}
        {EMOTE_CATEGORIES.map((category) => (
          <CategoryTab key={category} category={category} />
        ))}
      </TabsList>
      {first !== undefined && (
        <TabsContent value="mine">
          <OwnEmojiGrid emojis={own} onPick={onPick} />
        </TabsContent>
      )}
      {EMOTE_CATEGORIES.map((category) => (
        <TabsContent key={category} value={category}>
          <EmoteGrid emotes={emotesIn(category)} onPick={onPick} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function OwnTab({ emojiId }: Readonly<{ emojiId: string }>) {
  return (
    <TabsTrigger value="mine" aria-label="Meus emojis" title="Meus emojis">
      <CustomEmojiImage emojiId={emojiId} code="" sticker={false} decorative className="size-5" />
    </TabsTrigger>
  );
}

function CategoryTab({ category }: Readonly<{ category: EmoteCategory }>) {
  const { label, iconId } = CATEGORY_TABS[category];
  const icon = EMOTES.find((emote) => emote.id === iconId);
  return (
    <TabsTrigger value={category} aria-label={label} title={label}>
      {icon === undefined ? null : (
        <EmoteImage emote={icon} code={label} sticker={false} decorative className="size-5" />
      )}
    </TabsTrigger>
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
