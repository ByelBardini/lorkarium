import { useRef, useState } from 'react';
import type { DocumentTabSummaryDto, DocumentWriteResponseDto } from '@lorkarium/contracts';
import { ChevronDownIcon, EyeOffIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { moveFocusAlongTabs } from '@/lib/tab-focus';
import { splitTabsToFit, tabsThatFit } from '@/lib/tab-overflow';
import { useElementWidth } from '@/lib/use-element-width';
import { cn } from '@/lib/utils';
import type { DocumentsResult } from '@/services/documents-api';
import type { DocumentTabCommand } from '@/stores/document-editor-store';
import { documentFailureMessage } from './document-messages';
import { DocumentTabMenu, RemoveTabDialog, TabNameInput } from './document-tab-controls';
import { useDocumentTabDrag } from './use-document-tab-drag';

export type DocumentTabStripProps = Readonly<{
  tabs: readonly DocumentTabSummaryDto[];
  activeTabId: string | null;
  /** Master or owner, with the table live: create, rename, reorder and delete. */
  canEdit: boolean;
  /** The master: also hides a tab from the players. */
  canManage: boolean;
  /** Whether deleting this tab loses nothing (a blank body already read). */
  isBlank: (tabId: string) => boolean;
  onActivate: (tabId: string) => void;
  onCommand: (command: DocumentTabCommand) => Promise<DocumentsResult<DocumentWriteResponseDto>>;
}>;
// The width a tab shrinks to before it moves into the "+N" menu.
const TAB_MIN_WIDTH = 96;
const MORE_BUTTON_WIDTH = 52;
// gap-0.5 between the tabs, gap-1 before the "+N" and the "+" (size-7): the strip spends them too.
const TAB_GAP = 2;
const STRIP_GAP = 4;
const NEW_TAB_BUTTON_WIDTH = 28;

/** The tabs of one document under its title: "+" creates one and focuses its name, each tab's
 *  menu renames, moves, hides (master only) and deletes it, and dragging reorders. A reader sees
 *  only the tabs.
 *
 *  Example: `<DocumentTabStrip tabs={document.tabs} activeTabId={id} canEdit canManage={false} … />` */
export function DocumentTabStrip(props: DocumentTabStripProps): React.JSX.Element {
  const { tabs, activeTabId, canEdit } = props;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<DocumentTabSummaryDto | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const width = useElementWidth(strip);
  const ids = tabs.map((tab) => tab.id);
  const run = async (command: DocumentTabCommand): Promise<string | null> => {
    const result = await props.onCommand(command);
    setProblem(result.ok ? null : documentFailureMessage(result.failure));
    return result.ok ? (result.value.receipt.tabId ?? null) : null;
  };
  const drag = useDocumentTabDrag({ order: ids, enabled: canEdit, onReorder: run });
  const fit = tabsThatFit({
    width: Math.max(0, width - (canEdit ? NEW_TAB_BUTTON_WIDTH + STRIP_GAP : 0)),
    count: ids.length,
    minWidth: TAB_MIN_WIDTH,
    moreWidth: MORE_BUTTON_WIDTH + STRIP_GAP,
    gap: TAB_GAP,
  });
  const split = splitTabsToFit(ids, fit, [activeTabId ?? '', renaming ?? '']);
  const create = async (): Promise<void> => {
    const created = await run({ kind: 'create' });
    if (!created) return;
    props.onActivate(created);
    setRenaming(created);
  };
  const askRemove = (tab: DocumentTabSummaryDto): void => {
    if (props.isBlank(tab.id)) void run({ kind: 'remove', tabId: tab.id });
    else setRemoving(tab);
  };
  return (
    <div className="flex shrink-0 flex-col border-b border-divider px-3 sm:px-6">
      <div ref={strip} className="flex min-w-0 items-center gap-1">
        <div
          role="tablist"
          aria-label="Abas do documento"
          onKeyDown={moveFocusAlongTabs}
          className="flex min-w-0 items-center gap-0.5 overflow-hidden"
        >
          {tabs
            .filter((tab) => split.shown.includes(tab.id))
            .map((tab) => (
              <DocumentTabItem
                key={tab.id}
                tab={tab}
                selected={tab.id === activeTabId}
                renaming={renaming === tab.id}
                strip={props}
                dragProps={drag.tabProps(tab.id, tab.name)}
                onRename={(name) => {
                  setRenaming(null);
                  if (name !== null && name !== tab.name)
                    void run({ kind: 'rename', tabId: tab.id, name });
                }}
                onStartRename={() => setRenaming(tab.id)}
                onRemove={() => askRemove(tab)}
                onRun={(command) => void run(command)}
              />
            ))}
        </div>
        {split.hidden.length > 0 && (
          <HiddenDocumentTabs
            tabs={tabs.filter((tab) => split.hidden.includes(tab.id))}
            onActivate={props.onActivate}
          />
        )}
        {canEdit && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Nova aba"
            title="Nova aba"
            className="shrink-0 text-muted-foreground"
            onClick={() => void create()}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        )}
      </div>
      {problem && (
        <p role="alert" className="pb-2 text-xs text-destructive-text">
          {problem}
        </p>
      )}
      {removing && (
        <RemoveTabDialog
          name={removing.name}
          onAnswer={(confirmed) => {
            setRemoving(null);
            if (confirmed) void run({ kind: 'remove', tabId: removing.id });
          }}
        />
      )}
    </div>
  );
}

type DocumentTabItemProps = Readonly<{
  tab: DocumentTabSummaryDto;
  selected: boolean;
  renaming: boolean;
  strip: DocumentTabStripProps;
  dragProps: Readonly<Record<string, unknown>>;
  /** The trimmed new name, or null when renaming was abandoned. */
  onRename: (name: string | null) => void;
  onStartRename: () => void;
  onRemove: () => void;
  onRun: (command: DocumentTabCommand) => void;
}>;

function DocumentTabItem(props: DocumentTabItemProps): React.JSX.Element {
  const { tab, selected, strip } = props;
  if (props.renaming) return <TabNameInput name={tab.name} onDone={props.onRename} />;
  return (
    <div
      {...props.dragProps}
      className={cn(
        'flex min-w-0 shrink items-center border-b-2',
        selected ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        aria-label={tab.name}
        tabIndex={selected ? 0 : -1}
        onClick={() => strip.onActivate(tab.id)}
        className="flex min-w-0 items-center gap-1.5 px-2.5 py-2 text-sm hover:text-foreground"
      >
        <span className="truncate">{tab.name}</span>
        {tab.visibility === 'masters' && (
          <EyeOffIcon role="img" aria-label="Só mestres" className="size-3.5 shrink-0" />
        )}
      </button>
      {strip.canEdit && (
        <DocumentTabMenu
          tab={tab}
          order={strip.tabs.map(({ id }) => id)}
          canManage={strip.canManage}
          onRename={props.onStartRename}
          onRemove={props.onRemove}
          onRun={props.onRun}
        />
      )}
    </div>
  );
}

function HiddenDocumentTabs(
  props: Readonly<{ tabs: readonly DocumentTabSummaryDto[]; onActivate: (id: string) => void }>,
): React.JSX.Element {
  const count = props.tabs.length;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Mais ${count} ${count === 1 ? 'aba' : 'abas'}`}
          className="shrink-0 gap-1 px-2 text-muted-foreground"
        >
          +{count}
          <ChevronDownIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.tabs.map((tab) => (
          <DropdownMenuItem key={tab.id} onSelect={() => props.onActivate(tab.id)}>
            {tab.name}
            {tab.visibility === 'masters' && <EyeOffIcon aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
