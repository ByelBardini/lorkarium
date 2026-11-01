import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCharacters } from '@/stores/characters-store';
import { ConditionCardGrid } from './condition-card-grid';
import { conditionsInListOrder, type ConditionCatalogLink } from './condition-catalog-link';
import { ConditionEditorSheet, type EditorChoice } from './condition-editor-sheet';
import { DeleteConditionConfirm } from './delete-condition-confirm';
import { RestoreDefaultsButton } from './restore-defaults-button';

/** The body of "Condições da mesa" (master), under the page's bar: the search, "Restaurar
 *  padrões" and "Nova condição" on top, then the table's conditions as cards by nature, live from
 *  the open table; a card (or "Nova condição") opens the editor in a sheet on the right. Every
 *  change is a command that counts at once for everyone. Without the table open (`link: null`)
 *  it only says so.
 *
 *  Example: `<RoomCoverPage …><ConditionCatalogPage link={link} /></RoomCoverPage>` */
export function ConditionCatalogPage({
  link,
}: Readonly<{ link: ConditionCatalogLink | null }>): React.JSX.Element {
  if (!link) return <PageNotice text="Abra a mesa para mudar as condições." />;
  return <ConditionCatalog link={link} />;
}

function PageNotice({ text }: Readonly<{ text: string }>): React.JSX.Element {
  return <p className="px-4 pt-6 text-sm text-muted-foreground sm:px-8">{text}</p>;
}

function ConditionCatalog({ link }: Readonly<{ link: ConditionCatalogLink }>): React.JSX.Element {
  const definitions = useCharacters(link.table, (s) => s.conditionDefinitions);
  const loading = useCharacters(link.table, (s) => s.version === null);
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<EditorChoice | null>(null);
  const [deleting, setDeleting] = useState<ConditionDefinitionDto | null>(null);
  const shown = useMemo(() => conditionsInListOrder(definitions, query), [definitions, query]);
  if (loading) return <PageNotice text="Carregando as condições…" />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CatalogHeader
        definitions={definitions}
        link={link}
        query={query}
        onQuery={setQuery}
        onNew={() => setChoice({ kind: 'new' })}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <ConditionCardGrid
          shown={shown}
          total={definitions.length}
          onOpen={(definition) => setChoice({ kind: 'edit', conditionId: definition.id })}
        />
      </div>
      <ConditionEditorSheet
        link={link}
        definitions={definitions}
        choice={choice}
        onChoose={setChoice}
        onDelete={setDeleting}
      />
      {deleting && (
        <DeleteConditionConfirm
          definition={deleting}
          link={link}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

type CatalogHeaderProps = Readonly<{
  definitions: readonly ConditionDefinitionDto[];
  link: ConditionCatalogLink;
  query: string;
  onQuery: (query: string) => void;
  onNew: () => void;
}>;

function CatalogHeader(props: CatalogHeaderProps): React.JSX.Element {
  return (
    <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border px-4 py-4 sm:px-8">
      <div className="flex flex-col gap-1">
        <p className="max-w-prose text-sm text-muted-foreground">
          As condições que a mesa usa. Cada mudança vale na hora para todos.
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <SearchField query={props.query} onQuery={props.onQuery} />
        <RestoreDefaultsButton definitions={props.definitions} link={props.link} />
        <Button type="button" onClick={props.onNew}>
          <PlusIcon aria-hidden="true" />
          Nova condição
        </Button>
      </div>
    </div>
  );
}

function SearchField({
  query,
  onQuery,
}: Readonly<{ query: string; onQuery: (query: string) => void }>): React.JSX.Element {
  const id = useId();
  return (
    <div className="relative w-56">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-placeholder"
      />
      <label htmlFor={id} className="sr-only">
        Buscar condição
      </label>
      <Input
        id={id}
        type="search"
        value={query}
        placeholder="Buscar"
        onChange={(event) => onQuery(event.target.value)}
        className="h-9 pl-9 text-sm"
      />
    </div>
  );
}
