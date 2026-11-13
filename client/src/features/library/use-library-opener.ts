import type {
  CampaignDetailDto,
  DocumentSummaryDto,
  LibraryMapSummaryDto,
  SheetSummaryDto,
  SheetTemplateSummaryDto,
} from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatWindowHost } from '@/services/chat-window-host';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';

type OpenerOptions = Readonly<{
  campaign: CampaignDetailDto;
  documentWorkspace?: StoreApi<DocumentWorkspaceStore>;
  chatWindowHost?: ChatWindowHost;
}>;

/** How the library hands an item to the room's workspace. `detached`: in its own window, the room
 *  staying on what it showed (a blocked window falls back to the tab). */
export type LibraryOpener = Readonly<{
  openDocument: (document: DocumentSummaryDto, focusName: boolean, detached: boolean) => void;
  openSheet: (sheet: Pick<SheetSummaryDto, 'id' | 'name'>, detached: boolean) => void;
  /** A map only opens in the table's map tab: it has no window of its own. */
  openMap: (map: Pick<LibraryMapSummaryDto, 'id' | 'name'>) => void;
  /** A sheet template in a room tab, with a draft of its own (or the one a tab already has). */
  openSheetTemplate: (template: Pick<SheetTemplateSummaryDto, 'id' | 'name'>) => void;
}>;

/** Opens documents, sheets, maps and templates of the library in a room tab (shown behind the
 *  drawer, which stays open) or in a window (the room staying on what it showed).
 *
 *  Example: `const opener = useLibraryOpener(props); opener.openSheet(sheet, false)` */
export function useLibraryOpener(options: OpenerOptions): LibraryOpener {
  const { campaign, documentWorkspace: workspace, chatWindowHost } = options;
  const show = (open: (state: DocumentWorkspaceStore) => string, detached: boolean): void => {
    if (!workspace) return;
    const previous = workspace.getState().activeByCampaign[campaign.id] ?? null;
    const key = open(workspace.getState());
    if (detached && chatWindowHost && openedInWindow(workspace, key, chatWindowHost))
      workspace.getState().activate(campaign.id, previous);
  };
  return {
    openDocument: (document, focusName, detached) =>
      show((state) => state.open({ campaign, document, focusName }), detached),
    openSheet: (sheet, detached) =>
      show(
        (state) => state.openSheet({ campaign, sheetId: sheet.id, sheetName: sheet.name }),
        detached,
      ),
    openMap: (map) =>
      show((state) => state.openMap({ campaign, mapId: map.id, mapName: map.name }), false),
    openSheetTemplate: (template) =>
      show(
        (state) =>
          state.openSheetTemplate({
            campaign,
            templateId: template.id,
            templateName: template.name,
          }),
        false,
      ),
  };
}

function openedInWindow(
  workspace: StoreApi<DocumentWorkspaceStore>,
  key: string,
  host: ChatWindowHost,
): boolean {
  workspace.getState().openWindow(key, host);
  const state = workspace.getState();
  const item = [...state.entries, ...state.sheets].find((entry) => entry.key === key);
  return Boolean(item?.windowHandle);
}
