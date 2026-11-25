import type { CustomEmojiDto, CustomEmojiListDto } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { useCustomEmojisStore } from '@/components/custom-emojis/use-custom-emojis-store';
import { customEmojiImageUrlOf } from '@/emotes/emote-images';
import { customEmojiFailureText, customEmojiQuotaText } from '@/lib/custom-emoji-text';
import { useCustomEmojis, type CustomEmojisStore } from '@/stores/custom-emojis-store';
import { EMPTY_EMOJI_DRAFT, type EmojiDraft } from './custom-emoji-draft';
import { CustomEmojiForm } from './custom-emoji-form';
import { CustomEmojiItem } from './custom-emoji-item';
import { CustomEmojiPreview, type PreviewAuthor } from './custom-emoji-preview';
import { SectionHeading } from './section-heading';
import { SettingsLayout } from './settings-layout';
import { useObjectUrl } from './use-object-url';

export type CustomEmojisSectionProps = Readonly<{
  /** The account, as the sample message shows it. */
  author: PreviewAuthor;
}>;

type Editor = Readonly<{
  draft: EmojiDraft;
  editing: CustomEmojiDto | null;
  setDraft: (draft: EmojiDraft) => void;
  edit: (emoji: CustomEmojiDto | null) => void;
}>;

function useEditor(): Editor {
  const [draft, setDraft] = useState<EmojiDraft>(EMPTY_EMOJI_DRAFT);
  const [editing, setEditing] = useState<CustomEmojiDto | null>(null);
  const edit = (emoji: CustomEmojiDto | null): void => {
    setEditing(emoji);
    setDraft(emoji === null ? EMPTY_EMOJI_DRAFT : { name: emoji.name, picture: null });
  };
  return { draft, editing, setDraft, edit };
}

/** "Emojis" of "Minha conta": the form (a new emoji, or one clicked in the gallery), the plan's
 *  count and the gallery, with the sample message beside. Grátis sees which plan opens it.
 *
 *  Example: `<CustomEmojisSection author={profile} />` (inside `CustomEmojisProvider`) */
export function CustomEmojisSection({ author }: CustomEmojisSectionProps): React.JSX.Element {
  const titleId = useId();
  const store = useCustomEmojisStore();
  const list = useCustomEmojis(store, (state) => state.list);
  const problem = useCustomEmojis(store, (state) => state.problem);
  const editor = useEditor();
  const chosenUrl = useObjectUrl(editor.draft.picture);
  const editedUrl = editor.editing === null ? null : customEmojiImageUrlOf(editor.editing.id);
  const pictureUrl = chosenUrl ?? editedUrl;
  const preview = (
    <CustomEmojiPreview author={author} name={editor.draft.name} pictureUrl={pictureUrl} />
  );
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-8">
      <SectionHeading id={titleId} title="Emojis">
        Os seus próprios emojis, para usar no chat de qualquer mesa e nas mensagens privadas.
      </SectionHeading>
      <SettingsLayout aside={preview}>
        {list === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <EmojisOfAccount
            list={list}
            store={store.getState()}
            editor={editor}
            pictureUrl={pictureUrl}
          />
        )}
        {problem !== null && (
          <p role="alert" className="mt-4 text-sm text-destructive-text">
            {customEmojiFailureText(problem)}
          </p>
        )}
      </SettingsLayout>
    </section>
  );
}

type EmojisProps = Readonly<{
  list: CustomEmojiListDto;
  store: CustomEmojisStore;
  editor: Editor;
  pictureUrl: string | null;
}>;

// Every answer the server keeps leaves the form empty again.
function EmojisOfAccount({ list, store, editor, pictureUrl }: EmojisProps): React.JSX.Element {
  const done = (kept: boolean): boolean => {
    if (kept) editor.edit(null);
    return kept;
  };
  return (
    <div className="flex flex-col gap-10">
      <FormOrReason list={list} editor={editor}>
        <CustomEmojiForm
          draft={editor.draft}
          pictureUrl={pictureUrl}
          editing={editor.editing}
          onDraft={editor.setDraft}
          onCreate={async (name, picture) => done(await store.create(name, picture))}
          onRename={async (id, name) => done(await store.rename(id, name))}
          onRemove={async (id) => done(await store.remove(id))}
          onCancel={() => editor.edit(null)}
        />
      </FormOrReason>
      <Gallery list={list} editing={editor.editing} onSelect={editor.edit} />
    </div>
  );
}

type FormOrReasonProps = Readonly<{
  list: CustomEmojiListDto;
  editor: Editor;
  children: React.ReactNode;
}>;

// Editing always opens the form; a new one only fits below the plan's ceiling.
function FormOrReason({ list, editor, children }: FormOrReasonProps): React.JSX.Element {
  const { emojis, limit } = list;
  if (editor.editing !== null) return <>{children}</>;
  if (limit === 0 && emojis.length === 0) {
    return (
      <p className="max-w-prose text-sm text-muted-foreground">
        Disponível a partir do plano Apoiador, com imagens; na Lenda, também GIF animado.
      </p>
    );
  }
  if (limit !== null && emojis.length >= limit) {
    return (
      <p className="text-sm text-muted-foreground">
        Seu plano permite até {limit} emojis. Clique num deles para apagar e abrir espaço.
      </p>
    );
  }
  return <>{children}</>;
}

type GalleryProps = Readonly<{
  list: CustomEmojiListDto;
  editing: CustomEmojiDto | null;
  onSelect: (emoji: CustomEmojiDto) => void;
}>;

function Gallery({ list, editing, onSelect }: GalleryProps): React.JSX.Element {
  const { emojis, limit } = list;
  const inactive = emojis.some((emoji) => !emoji.active);
  return (
    <div className="flex flex-col gap-4 border-t border-divider pt-8">
      <Quota count={emojis.length} limit={limit} />
      {inactive && (
        <p className="text-sm text-muted-foreground">
          Os inativos passam do que o seu plano permite ({limit ?? 0}): continuam aqui, mas não
          aparecem nas mensagens.
        </p>
      )}
      {emojis.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum emoji ainda.</p>
      ) : (
        <ul
          aria-label="Seus emojis"
          className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2"
        >
          {emojis.map((emoji) => (
            <CustomEmojiItem
              key={emoji.id}
              emoji={emoji}
              selected={editing?.id === emoji.id}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// A flat bar under the count: the ceiling at a glance, never a pill.
function Quota({ count, limit }: Readonly<{ count: number; limit: number | null }>) {
  const filled = limit === null || limit === 0 ? 0 : Math.min(100, (count / limit) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-base font-semibold">Seus emojis</h3>
        <span className="font-mono text-sm text-label" aria-live="polite">
          {customEmojiQuotaText(count, limit)}
        </span>
      </div>
      {limit !== null && limit > 0 && (
        <div aria-hidden="true" className="h-0.5 w-full bg-divider">
          <div className="h-full bg-primary" style={{ width: `${filled}%` }} />
        </div>
      )}
    </div>
  );
}
