import { LibraryIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { TurnLine } from '@/features/combat/turn-line';
import { cn } from '@/lib/utils';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import { SceneTabs } from './scene-tabs';
import { useLibraryToggle } from './use-library-toggle';
import { LIBRARY_TOGGLE_ATTRIBUTE } from '@/features/library/use-outside-press';

export type RoomTabStripProps = Readonly<{
  campaignId: string;
  /** `null` until the table opens. */
  tabs: StoreApi<SceneTabsStore> | null;
  documentWorkspace?: StoreApi<DocumentWorkspaceStore>;
  mainSheetKey: string | null;
  /** The board of the tab shown (its turn line). */
  board: StoreApi<BoardStore> | null;
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** The second band of the room's top, "what I am looking at": the golden "Biblioteca" (Shift+B),
 *  the open tabs and the turn line.
 *
 *  Example: `<RoomTabStrip campaignId={campaign.id} tabs={tabs} mainSheetKey={null} board={board} interaction={interaction} />` */
export function RoomTabStrip(props: RoomTabStripProps): React.JSX.Element {
  const { campaignId, tabs, board, interaction } = props;
  const library = useLibraryToggle(campaignId);
  return (
    <section
      aria-label="Abas da sala"
      className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-panel px-3"
    >
      <LibraryButton open={library.open} onClick={library.toggle} />
      {tabs && (
        <SceneTabs
          tabs={tabs}
          documents={props.documentWorkspace}
          campaignId={campaignId}
          mainSheetKey={props.mainSheetKey}
        />
      )}
      {board && (
        <TurnLine
          board={board}
          interaction={interaction}
          className="ml-auto hidden min-w-0 shrink truncate lg:block"
        />
      )}
    </section>
  );
}

type LibraryButtonProps = Readonly<{ open: boolean; onClick: () => void }>;

// Gold and always in sight: the library is where every grid, image and sheet of the table lives.
function LibraryButton({ open, onClick }: LibraryButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label="Biblioteca"
      aria-pressed={open}
      {...{ [LIBRARY_TOGGLE_ATTRIBUTE]: '' }}
      aria-keyshortcuts="Shift+B"
      title="Biblioteca (Shift+B)"
      onClick={onClick}
      className={cn(
        'flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border px-2 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
        open
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-primary/60 text-primary hover:border-primary',
      )}
    >
      <LibraryIcon aria-hidden="true" className="size-4" />
      Biblioteca
      <kbd className="hidden text-[11px] opacity-70 xl:inline">⇧B</kbd>
    </button>
  );
}
