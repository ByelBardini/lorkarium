import type { CustomEmojiListDto } from '@lorkarium/contracts';
import { useCustomEmojisStore } from '@/components/custom-emojis/use-custom-emojis-store';
import { customEmojiFailureText, customEmojiQuotaText } from '@/lib/custom-emoji-text';
import { useCustomEmojis, type CustomEmojisStore } from '@/stores/custom-emojis-store';
import { CustomEmojiForm } from './custom-emoji-form';
import { CustomEmojiItem } from './custom-emoji-item';
import { SettingsRow } from './settings-row';

const HINT =
  'Use no chat de qualquer mesa e nas mensagens privadas escrevendo :nome:. Só você usa os seus; quem recebe vê a imagem. PNG, JPEG, WebP ou GIF até 2 MB, cortada no centro em 128 px. GIF animado só no plano Lenda; nos outros fica parado.';

/** "Emojis" of "Minha conta": the account's own emojis, how many the plan allows, adding a new
 *  one and renaming or removing each. Grátis sees why it cannot add.
 *
 *  Example: `<CustomEmojisSection />` (inside `CustomEmojisProvider`) */
export function CustomEmojisSection(): React.JSX.Element {
  const store = useCustomEmojisStore();
  const list = useCustomEmojis(store, (state) => state.list);
  const problem = useCustomEmojis(store, (state) => state.problem);
  return (
    <SettingsRow title="Emojis personalizados" group description={HINT}>
      <div className="flex flex-col gap-5">
        {list === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <EmojisOfAccount list={list} store={store.getState()} />
        )}
        {problem !== null && (
          <p role="alert" className="text-sm text-destructive">
            {customEmojiFailureText(problem)}
          </p>
        )}
      </div>
    </SettingsRow>
  );
}

type EmojisProps = Readonly<{ list: CustomEmojiListDto; store: CustomEmojisStore }>;

type NewEmojiProps = Readonly<{
  full: boolean;
  limit: number | null;
  onCreate: CustomEmojisStore['create'];
}>;

function NewEmoji({ full, limit, onCreate }: NewEmojiProps): React.JSX.Element {
  if (!full) return <CustomEmojiForm onCreate={onCreate} />;
  return (
    <p className="text-sm text-muted-foreground">
      Seu plano permite até {limit} emojis. Apague um para adicionar outro.
    </p>
  );
}

function EmojisOfAccount({ list, store }: EmojisProps): React.JSX.Element {
  const { emojis, limit } = list;
  const full = limit !== null && emojis.length >= limit;
  return (
    <>
      <p className="text-sm font-medium" aria-live="polite">
        {customEmojiQuotaText(emojis.length, limit)} emojis
      </p>
      {limit === 0 && emojis.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Disponível a partir do plano Apoiador (imagens) e Lenda (GIF animado).
        </p>
      ) : (
        <NewEmoji full={full} limit={limit} onCreate={store.create} />
      )}
      {emojis.length > 0 && (
        <ul aria-label="Seus emojis" className="grid gap-2 sm:grid-cols-2">
          {emojis.map((emoji) => (
            <CustomEmojiItem
              key={emoji.id}
              emoji={emoji}
              limit={limit}
              onRename={store.rename}
              onRemove={store.remove}
            />
          ))}
        </ul>
      )}
    </>
  );
}
