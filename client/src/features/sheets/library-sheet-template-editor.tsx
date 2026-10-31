import type { CampaignDetailDto } from '@lorkarium/contracts';
import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { SheetTemplatesApi } from '@/services/sheet-templates-api';
import type { SheetEditorLayoutMemory } from '@/lib/sheet-editor-layout';
import type { ChatWindowHost } from '@/services/chat-window-host';
import type { Clipboard } from '@/services/clipboard';
import {
  sheetTemplateWorkspaceKey,
  useDocumentWorkspaceSlice,
  type DocumentWorkspaceStore,
} from '@/stores/document-workspace-store';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import {
  createSheetTemplateDraftStore,
  type SheetTemplateDraftState,
} from '@/stores/sheet-template-draft-store';
import { SheetTemplateEditor } from './sheet-template-editor';
import type { TemplateEditorMoves } from './sheet-template-editor-actions';
import type { RegisterLeave } from './use-template-leave-guard';
import { useTemplateLibraryRefresh } from './use-template-library-refresh';

export type LibrarySheetTemplateEditorProps = Readonly<{
  campaign: CampaignDetailDto;
  templateId: string;
  /** The name the library lists, for the tab while the template still loads. */
  templateName: string;
  api: SheetTemplatesApi;
  live: boolean;
  tabs: StoreApi<SceneTabsStore> | null;
  workspace?: StoreApi<DocumentWorkspaceStore>;
  chatWindowHost?: ChatWindowHost;
  layoutMemory?: SheetEditorLayoutMemory;
  clipboard?: Clipboard;
  onRegisterLeave?: RegisterLeave;
  /** After "Abrir modelo em aba": the library goes back to the room, where the tab is. */
  onOpenedTab: () => void;
}>;

/** The template editor inside the library. A template already open in a room tab shares that
 *  tab's draft (one text, nothing asked on leaving the library: the tab keeps it); "Abrir modelo
 *  em aba" and "Abrir modelo em janela" hand the library's draft, unsaved text included, over.
 *
 *  Example: `<LibrarySheetTemplateEditor key={id} campaign={campaign} templateId={id} templateName="Ficha Tormenta" api={api} live tabs={table.tabs} workspace={workspace} onOpenedTab={backToRoom} />` */
export function LibrarySheetTemplateEditor(
  props: LibrarySheetTemplateEditorProps,
): React.JSX.Element {
  const { api, campaign, templateId } = props;
  const [own] = useState(() =>
    createSheetTemplateDraftStore({ api, campaignId: campaign.id, templateId }),
  );
  const shared = useDocumentWorkspaceSlice(
    props.workspace,
    (state) => state.templates.find(({ key }) => key === keyOf(props))?.draft ?? null,
    null,
  );
  const draft = shared ?? own;
  useTemplateLibraryRefresh(props.tabs, draft);
  return (
    <SheetTemplateEditor
      draft={draft}
      live={props.live}
      onRegisterLeave={shared ? undefined : props.onRegisterLeave}
      moves={movesOf(props, draft)}
      layoutMemory={props.layoutMemory}
      windows={props.chatWindowHost}
      clipboard={props.clipboard}
    />
  );
}

function keyOf(props: LibrarySheetTemplateEditorProps): string {
  return sheetTemplateWorkspaceKey(props.campaign.id, props.templateId);
}

function movesOf(
  props: LibrarySheetTemplateEditorProps,
  draft: StoreApi<SheetTemplateDraftState>,
): TemplateEditorMoves | undefined {
  const { workspace, chatWindowHost } = props;
  if (!workspace) return undefined;
  const open = (): string =>
    workspace.getState().openSheetTemplate({
      campaign: props.campaign,
      templateId: props.templateId,
      templateName: props.templateName,
      draft,
    });
  return {
    openTab: () => {
      open();
      props.onOpenedTab();
    },
    openWindow:
      chatWindowHost &&
      (() =>
        openInWindow({ workspace, host: chatWindowHost, campaignId: props.campaign.id, open })),
  };
}

// The window opens in the click (a pop-up blocker allows only that); the room keeps showing what
// it showed, as "Abrir em outra janela" of a document does.
function openInWindow(
  input: Readonly<{
    workspace: StoreApi<DocumentWorkspaceStore>;
    host: ChatWindowHost;
    campaignId: string;
    open: () => string;
  }>,
): void {
  const { workspace, campaignId } = input;
  const previous = workspace.getState().activeByCampaign[campaignId] ?? null;
  const key = input.open();
  workspace.getState().openWindow(key, input.host);
  const opened = workspace.getState().templates.find((item) => item.key === key);
  if (opened?.windowHandle) workspace.getState().activate(campaignId, previous);
}
