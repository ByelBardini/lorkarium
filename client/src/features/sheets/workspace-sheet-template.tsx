import { useCallback } from 'react';
import type { AppDependencies } from '@/app/router';
import { WorkspaceItemSurface } from '@/features/documents/workspace-item-surface';
import { useLibraryTable } from '@/features/library/use-library-table';
import { useOpenTable } from '@/features/sessions/use-open-table';
import type { SheetTemplateWorkspaceEntry } from '@/stores/document-workspace-store';
import { SheetTemplateEditor } from './sheet-template-editor';
import { useTemplateLibraryRefresh } from './use-template-library-refresh';

/** One template editor of the workspace, in its room tab or its window: the same draft in both
 *  (and in the library, when it shows this template), read again at each `library:changed`, and
 *  closing the tab with unsaved code asks first.
 *
 *  Example: `{templates.map((entry) => <WorkspaceSheetTemplate key={entry.key} deps={deps} entry={entry} />)}` */
export function WorkspaceSheetTemplate({
  deps,
  entry,
}: Readonly<{ deps: AppDependencies; entry: SheetTemplateWorkspaceEntry }>): React.JSX.Element {
  useOpenTable(entry.campaign, deps.openTables);
  const { table, live } = useLibraryTable(deps.openTables, entry.campaign.id);
  useTemplateLibraryRefresh(table?.tabs ?? null, entry.draft);
  const registerLeave = useCallback(
    (guard: (() => Promise<boolean>) | null) =>
      deps.documentWorkspace.getState().setLeaveGuard(entry.key, guard),
    [deps.documentWorkspace, entry.key],
  );
  return (
    <WorkspaceItemSurface deps={deps} item={entry} detachedLabel="Modelo aberto em outra janela.">
      {(surface) => (
        <SheetTemplateEditor
          draft={entry.draft}
          live={live}
          onRegisterLeave={registerLeave}
          moves={{ openWindow: surface.openWindow, close: surface.close }}
          layoutMemory={deps.sheetEditorLayout}
          windows={deps.chatWindowHost}
          clipboard={deps.clipboard}
          exportPorts={{
            api: deps.sheetTemplatesApi,
            fileDownload: deps.fileDownload,
            campaignId: entry.campaign.id,
          }}
          now={deps.now}
        />
      )}
    </WorkspaceItemSurface>
  );
}
