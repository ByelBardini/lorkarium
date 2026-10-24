import { XIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { cn } from '@/lib/utils';
import { useBoard } from '@/stores/board-store';
import {
  GROUP_TAB,
  useSceneTabs,
  type SceneTab,
  type SceneTabsStore,
} from '@/stores/scene-tabs-store';

export type SceneTabsProps = Readonly<{ tabs: StoreApi<SceneTabsStore> }>;

const LOADING_NAME = 'Carregando…';

/** The strip of open grids at the top of the room: the group grid's tab first (marked "Grupo",
 *  never closed), then the extra ones, each with "Fechar <grid>". Arrows move the focus along the
 *  tabs and Enter shows the focused one; the notice of the tabs (an activation, a tab closed by the
 *  server) is said in a `role="status"`.
 *
 *  Example: `<SceneTabs tabs={table.tabs} />` */
export function SceneTabs({ tabs }: SceneTabsProps): React.JSX.Element {
  const open = useSceneTabs(tabs, (state) => state.tabs);
  const visibleKey = useSceneTabs(tabs, (state) => state.visibleKey);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        role="tablist"
        aria-label="Grids abertos"
        onKeyDown={moveFocusAlongTabs}
        className="flex min-w-0 items-center gap-1 overflow-x-auto"
      >
        {open.map((tab) => (
          <SceneTabItem
            key={tab.key}
            tab={tab}
            selected={tab.key === visibleKey}
            onShow={() => tabs.getState().show(tab.key)}
            onClose={() => tabs.getState().close(tab.key)}
          />
        ))}
      </div>
      <TabsNotice tabs={tabs} />
    </div>
  );
}

type SceneTabItemProps = Readonly<{
  tab: SceneTab;
  selected: boolean;
  onShow: () => void;
  onClose: () => void;
}>;

function SceneTabItem({ tab, selected, onShow, onClose }: SceneTabItemProps): React.JSX.Element {
  const name = useBoard(tab.board, (state) => state.board?.scene.name) ?? LOADING_NAME;
  const isGroup = tab.key === GROUP_TAB;
  return (
    <div
      className={cn(
        'flex h-12 shrink-0 items-center gap-1 border-b-2',
        selected ? 'border-primary' : 'border-transparent',
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        tabIndex={selected ? 0 : -1}
        onClick={onShow}
        className={cn(
          'flex items-center gap-2 px-2 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
          selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span className="max-w-40 truncate">{name}</span>
        {isGroup && (
          <span className="text-[11px] tracking-[0.12em] text-label uppercase">Grupo</span>
        )}
      </button>
      {!isGroup && (
        <button
          type="button"
          aria-label={`Fechar ${name}`}
          onClick={onClose}
          className="grid size-6 place-items-center rounded-sm text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <XIcon aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// Always mounted, so a screen reader hears each new notice as it lands.
function TabsNotice({ tabs }: Readonly<{ tabs: StoreApi<SceneTabsStore> }>): React.JSX.Element {
  const notice = useSceneTabs(tabs, (state) => state.notice);
  return (
    <p
      role="status"
      aria-label="Aviso dos grids"
      className="min-w-0 truncate text-xs text-muted-foreground"
    >
      {notice}
    </p>
  );
}

const FOCUS_STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

// Roving focus over the tabs (the close buttons keep their own place in the Tab order).
function moveFocusAlongTabs(event: React.KeyboardEvent<HTMLDivElement>): void {
  const step = FOCUS_STEP[event.key];
  if (step === undefined) return;
  const all = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
  const at = all.findIndex((tab) => tab === document.activeElement);
  if (at === -1) return;
  event.preventDefault();
  all[(at + step + all.length) % all.length]?.focus();
}
