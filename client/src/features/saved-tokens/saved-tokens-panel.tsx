import type { SavedTokenDto, SavedTokenFolderDto } from '@lorkarium/contracts';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SavedTokensResult } from '@/services/saved-tokens-api';
import { useSavedTokensStore, type SavedTokensStore } from '@/stores/saved-tokens-store';
import type { SpawnAimStore } from '@/stores/spawn-aim-flow';
import { DROP_TARGET_CLASS, NewSavedTokenFolder, SavedTokenFolder } from './saved-token-folders';
import { useFolderDrop } from './use-folder-drop';
import { cn } from '@/lib/utils';
import { SearchIcon } from 'lucide-react';
import { TokenAvatar } from '@/features/tokens/token-avatar';
import {
  NO_FOLDER_LABEL,
  SAVED_TOKENS_EMPTY,
  SAVED_TOKENS_TITLE,
  SPAWN_HOW_TO,
  SPAWN_LOCKED_HINT,
  SPECTATOR_SAVES_NOTHING,
  armedHint,
  savedTokenFailureMessage,
} from './saved-token-messages';
import { SavedTokenRow } from './saved-token-row';

export type SavedTokensPanelProps = Readonly<{
  list: StoreApi<SavedTokensStore>;
  aim: StoreApi<SpawnAimStore>;
  /** The viewer may create tokens here (master, or a player with the table's create setting). */
  canSpawn: boolean;
  watchesOnly: boolean;
}>;

/** The "Tokens salvos" tab: the viewer's saved tokens at this table by folder, with a search.
 *  A click on one arms it (the board spawns it on each press until Esc or "Parar"); without the
 *  right to create tokens the entries do not arm and the panel says why.
 *
 *  Example: `<SavedTokensPanel list={savedTokens} aim={spawn.aim} canSpawn={canCreate} watchesOnly={false} />` */
export function SavedTokensPanel(props: SavedTokensPanelProps): React.JSX.Element {
  if (props.watchesOnly)
    return <p className="text-sm text-muted-foreground">{SPECTATOR_SAVES_NOTHING}</p>;
  return <OwnSavedTokens {...props} />;
}

function OwnSavedTokens({ list, aim, canSpawn }: SavedTokensPanelProps): React.JSX.Element {
  useEffect(() => list.getState().load(), [list]);
  const savedTokens = useSavedTokensStore(list, (state) => state.savedTokens);
  const folders = useSavedTokensStore(list, (state) => state.folders);
  const armed = useStore(aim, (state) => state.armed);
  const [search, setSearch] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const onProblem = (result: SavedTokensResult<null>): void =>
    setProblem(result.ok ? null : savedTokenFailureMessage(result.failure));
  const shown = useMemo(() => matching(savedTokens ?? [], search), [savedTokens, search]);
  const row = (saved: SavedTokenDto) => (
    <SavedTokenRow
      key={saved.id}
      saved={saved}
      folders={folders}
      list={list}
      armed={armed?.id === saved.id}
      canSpawn={canSpawn}
      onArm={aim.getState().arm}
      onProblem={onProblem}
    />
  );
  return (
    <section aria-label={SAVED_TOKENS_TITLE} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Buscar token salvo"
            placeholder="Buscar token"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <NewSavedTokenFolder list={list} onProblem={onProblem} />
      </div>
      {!canSpawn && <p className="text-xs text-muted-foreground">{SPAWN_LOCKED_HINT}</p>}
      {armed && <ArmedLine saved={armed} onStop={aim.getState().disarm} />}
      {canSpawn && !armed && shown.length > 0 && (
        <p className="text-xs text-muted-foreground">{SPAWN_HOW_TO}</p>
      )}
      {savedTokens?.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          {SAVED_TOKENS_EMPTY}
        </p>
      )}
      {folders.map((folder) => (
        <SavedTokenFolder
          key={folder.id}
          folder={folder}
          count={groupOf(folder, shown).length}
          list={list}
          onProblem={onProblem}
        >
          {groupOf(folder, shown).map(row)}
        </SavedTokenFolder>
      ))}
      <LooseGroup list={list} onProblem={onProblem}>
        {folders.length > 0 && (
          <li className="px-1 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {NO_FOLDER_LABEL}
          </li>
        )}
        {groupOf(null, shown).map(row)}
      </LooseGroup>
      {problem !== null && (
        <p role="alert" className="text-xs text-destructive-text">
          {problem}
        </p>
      )}
    </section>
  );
}

type LooseGroupProps = Readonly<{
  list: StoreApi<SavedTokensStore>;
  onProblem: (result: SavedTokensResult<null>) => void;
  children: React.ReactNode;
}>;

// "Sem pasta" takes a drop too: a token dragged there leaves its folder.
function LooseGroup({ list, onProblem, children }: LooseGroupProps): React.JSX.Element {
  const drop = useFolderDrop(list, null, onProblem);
  return (
    <ul
      role="group"
      aria-label={NO_FOLDER_LABEL}
      {...drop.handlers}
      className={cn('flex min-h-8 flex-col gap-0.5 rounded-lg', drop.over && DROP_TARGET_CLASS)}
    >
      {children}
    </ul>
  );
}

function ArmedLine({ saved, onStop }: Readonly<{ saved: SavedTokenDto; onStop: () => void }>) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-2 text-xs text-primary">
      <TokenAvatar token={saved.token} size="sm" />
      <span className="min-w-0 flex-1">{armedHint(saved.name)}</span>
      <Button size="sm" variant="outline" onClick={onStop}>
        Parar
      </Button>
    </div>
  );
}

function matching(savedTokens: readonly SavedTokenDto[], search: string): SavedTokenDto[] {
  const wanted = search.trim().toLocaleLowerCase('pt-BR');
  if (wanted === '') return [...savedTokens];
  return savedTokens.filter((saved) => saved.name.toLocaleLowerCase('pt-BR').includes(wanted));
}

function groupOf(
  folder: SavedTokenFolderDto | null,
  savedTokens: readonly SavedTokenDto[],
): SavedTokenDto[] {
  const folderId = folder?.id ?? null;
  return savedTokens.filter((saved) => saved.folderId === folderId);
}
