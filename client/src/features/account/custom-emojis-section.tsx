import type { CustomEmojiListDto } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { useCustomEmojisStore } from '@/components/custom-emojis/use-custom-emojis-store';
import { customEmojiFailureText, customEmojiQuotaText } from '@/lib/custom-emoji-text';
import { useCustomEmojis, type CustomEmojisStore } from '@/stores/custom-emojis-store';
import { EMPTY_EMOJI_DRAFT, type EmojiDraft } from './custom-emoji-draft';
import { CustomEmojiForm } from './custom-emoji-form';
import { CustomEmojiItem } from './custom-emoji-item';
import { CustomEmojiPreview } from './custom-emoji-preview';
import { SectionHeading } from './section-heading';
import { SettingsLayout } from './settings-layout';
import { useObjectUrl } from './use-object-url';

/** "Emojis" of "Minha conta": a new emoji (picture and name) beside how it reads in the chat, the
 *  plan's count with its bar, and the account's emojis as a gallery. Grátis sees which plan opens
 *  it.
 *
 *  Example: `<CustomEmojisSection />` (inside `CustomEmojisProvider`) */
export function CustomEmojisSection(): React.JSX.Element {
  const titleId = useId();
  const store = useCustomEmojisStore();
  const list = useCustomEmojis(store, (state) => state.list);
  const problem = useCustomEmojis(store, (state) => state.problem);
  const [draft, setDraft] = useState<EmojiDraft>(EMPTY_EMOJI_DRAFT);
  const pictureUrl = useObjectUrl(draft.picture);
  const newest = list?.emojis.at(-1) ?? null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-8">
      <SectionHeading id={titleId} title="Emojis">
        Os seus próprios emojis, para usar no chat de qualquer mesa e nas mensagens privadas.
      </SectionHeading>
      <SettingsLayout
        aside={<CustomEmojiPreview name={draft.name} pictureUrl={pictureUrl} newest={newest} />}
      >
        {list === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <EmojisOfAccount
            list={list}
            store={store.getState()}
            draft={draft}
            pictureUrl={pictureUrl}
            onDraft={setDraft}
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
  draft: EmojiDraft;
  pictureUrl: string | null;
  onDraft: (draft: EmojiDraft) => void;
}>;

function EmojisOfAccount(props: EmojisProps): React.JSX.Element {
  const { list, store, onDraft } = props;
  const create = async (name: string, picture: File): Promise<boolean> => {
    const kept = await store.create(name, picture);
    if (kept) onDraft(EMPTY_EMOJI_DRAFT);
    return kept;
  };
  return (
    <div className="flex flex-col gap-10">
      <NewEmoji {...props} onCreate={create} />
      <Gallery list={list} store={store} />
    </div>
  );
}

function NewEmoji(
  props: EmojisProps & Readonly<{ onCreate: (name: string, picture: File) => Promise<boolean> }>,
) {
  const { emojis, limit } = props.list;
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
        Seu plano permite até {limit} emojis. Apague um para adicionar outro.
      </p>
    );
  }
  return (
    <CustomEmojiForm
      draft={props.draft}
      pictureUrl={props.pictureUrl}
      onDraft={props.onDraft}
      onCreate={props.onCreate}
    />
  );
}

function Gallery({
  list,
  store,
}: Readonly<{ list: CustomEmojiListDto; store: CustomEmojisStore }>) {
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
          className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3"
        >
          {emojis.map((emoji) => (
            <CustomEmojiItem
              key={emoji.id}
              emoji={emoji}
              onRename={store.rename}
              onRemove={store.remove}
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
