import type {
  CampaignDetailDto,
  DocumentSummaryDto,
  LibraryImageDto,
  LibraryMapSummaryDto,
  SheetSummaryDto,
} from '@lorkarium/contracts';
import { useNavigate } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { DocumentPreview } from '@/features/documents/document-preview';
import { LibrarySheetTemplateEditor } from '@/features/sheets/library-sheet-template-editor';
import { sheetHolderLabel } from '@/features/sheets/sheet-messages';
import {
  documentIdOf,
  imageIdOf,
  mapIdOf,
  sheetIdOf,
  type MixedLibrary,
} from '@/lib/library-entries';
import type { SheetEditorLayoutMemory } from '@/lib/sheet-editor-layout';
import type { ChatWindowHost } from '@/services/chat-window-host';
import type { Clipboard } from '@/services/clipboard';
import type { DocumentsApi } from '@/services/documents-api';
import type { LibraryApi } from '@/services/library-api';
import type { ImagePresentationApi } from '@/services/image-presentation-api';
import type { SheetTemplatesApi } from '@/services/sheet-templates-api';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import { ImageDetails } from './image-details';
import type { LibraryIntent } from './library-intents';
import { sceneIdOf } from './library-view';
import { MapDetails } from './map-details';
import { SceneDetails } from './scene-details';
import { SheetDetails } from './sheet-details';
import type { GuardedPick } from './use-guarded-pick';
import type { LibraryOpener } from './use-library-opener';
import type { LibrarySubmit } from './use-library-submit';
import type { LibraryTableView } from './use-library-table';
import type { SheetHolderDirectory } from './use-sheet-holder-names';
import type { SheetTemplateFiles } from './use-sheet-template-files';

/** What the panels need from outside the library screen. */
export type LibraryPanelPorts = Readonly<{
  campaign: CampaignDetailDto;
  tableView: LibraryTableView;
  now: Date;
  presentations: ImagePresentationApi;
  documentsApi: DocumentsApi;
  /** The master's template editor; without it a template picked shows nothing. */
  sheetTemplatesApi?: SheetTemplatesApi;
  sheetEditorLayout?: SheetEditorLayoutMemory;
  clipboard: Clipboard;
  documentWorkspace?: StoreApi<DocumentWorkspaceStore>;
  chatWindowHost?: ChatWindowHost;
}>;

/** What the panels read from the library screen's state. */
export type LibraryPanelModel = Readonly<{
  /** The library with the move being sent already in place. */
  library: MixedLibrary;
  isMaster: boolean;
  live: boolean;
  /** The item picked, if it still exists. */
  pickedKey: string | null;
  submit: LibrarySubmit;
  /** The change on its way to the server, until the list has been read again. */
  pending: LibraryIntent | null;
  focusNameId: string | null;
  openTab: (sceneId: string) => void;
  templateFiles: SheetTemplateFiles;
  holders: SheetHolderDirectory;
  opener: LibraryOpener;
  /** The tree's pick: asks an editor with unsaved code before leaving it. */
  guardedPick: GuardedPick;
}>;

export type LibraryItemPanelProps = LibraryPanelPorts &
  Readonly<{
    model: LibraryPanelModel;
    templateId: string | null;
    /** The library the template preview reads the public documents from. */
    libraryApi?: Pick<LibraryApi, 'list'>;
  }>;

/** The panel of the item picked in the tree, by its type: the template editor, a document's
 *  preview, an image, a map, a sheet or a grid (which also says that nothing is picked).
 *
 *  Example: `<LibraryItemPanel {...ports} model={model} templateId={null} />` */
export function LibraryItemPanel(props: LibraryItemPanelProps): React.JSX.Element {
  const { library, pickedKey } = props.model;
  if (props.templateId !== null && props.sheetTemplatesApi)
    return (
      <PickedTemplate {...props} templateId={props.templateId} api={props.sheetTemplatesApi} />
    );
  const document = library.documents?.find(({ id }) => id === documentIdOf(pickedKey));
  if (document) return <PickedDocument {...props} document={document} />;
  const image = library.images?.find(({ id }) => id === imageIdOf(pickedKey));
  if (image) return <PickedImage {...props} image={image} />;
  const map = library.maps?.find(({ id }) => id === mapIdOf(pickedKey));
  if (map) return <PickedMap {...props} map={map} />;
  const sheet = library.sheets?.find(({ id }) => id === sheetIdOf(pickedKey));
  if (sheet) return <PickedSheet {...props} sheet={sheet} />;
  return <PickedGrid {...props} />;
}

type PickedTemplateProps = LibraryItemPanelProps &
  Readonly<{ templateId: string; api: SheetTemplatesApi }>;

function PickedTemplate({ model, templateId, api, ...props }: PickedTemplateProps) {
  const navigate = useNavigate();
  return (
    <LibrarySheetTemplateEditor
      key={templateId}
      campaign={props.campaign}
      templateId={templateId}
      templateName={model.library.sheetTemplates?.find(({ id }) => id === templateId)?.name ?? ''}
      api={api}
      live={model.live}
      tabs={props.tableView.table?.tabs ?? null}
      workspace={props.documentWorkspace}
      chatWindowHost={props.chatWindowHost}
      layoutMemory={props.sheetEditorLayout}
      clipboard={props.clipboard}
      exportPorts={model.templateFiles.exportPorts}
      documentSources={
        props.libraryApi && { library: props.libraryApi, documents: props.documentsApi }
      }
      onRegisterLeave={model.guardedPick.registerLeave}
      onOpenedTab={() => void navigate(`/campaigns/${encodeURIComponent(props.campaign.id)}/table`)}
    />
  );
}

type PickedDocumentProps = LibraryItemPanelProps & Readonly<{ document: DocumentSummaryDto }>;

function PickedDocument({ model, document, ...props }: PickedDocumentProps) {
  const focusName = model.focusNameId === document.id;
  return (
    <DocumentPreview
      key={document.id}
      campaignId={props.campaign.id}
      summary={document}
      api={props.documentsApi}
      live={model.live}
      onOpen={() => model.opener.openDocument(document, focusName, false)}
      onOpenWindow={() => model.opener.openDocument(document, focusName, true)}
    />
  );
}

type PickedImageProps = LibraryItemPanelProps & Readonly<{ image: LibraryImageDto }>;

function PickedImage({ model, image, ...props }: PickedImageProps) {
  return (
    <ImageDetails
      key={image.id}
      image={image}
      library={model.library}
      campaignId={props.campaign.id}
      isMaster={model.isMaster}
      live={model.live}
      submit={model.submit}
      presentations={props.presentations}
      store={props.tableView.table?.imagePresentation ?? null}
    />
  );
}

type PickedMapProps = LibraryItemPanelProps & Readonly<{ map: LibraryMapSummaryDto }>;

function PickedMap({ model, map }: PickedMapProps) {
  const pendingIntent = model.pending?.intent;
  return (
    <MapDetails
      key={map.id}
      map={map}
      isMaster={model.isMaster}
      live={model.live}
      mainPending={pendingIntent === 'setMainMap' || pendingIntent === 'unsetMainMap'}
      submit={model.submit}
      onOpen={() => model.opener.openMap(map)}
    />
  );
}

type PickedSheetProps = LibraryItemPanelProps & Readonly<{ sheet: SheetSummaryDto }>;

function PickedSheet({ model, sheet }: PickedSheetProps) {
  const template = model.library.sheetTemplates?.find(({ id }) => id === sheet.templateId);
  return (
    <SheetDetails
      sheet={sheet}
      holderLabel={sheetHolderLabel(sheet, model.holders.names)}
      templateName={template?.name ?? null}
      onOpen={() => model.opener.openSheet(sheet, false)}
      onOpenWindow={() => model.opener.openSheet(sheet, true)}
    />
  );
}

function PickedGrid({ model, ...props }: LibraryItemPanelProps) {
  const { library } = model;
  const pickedSceneId = sceneIdOf(model.pickedKey);
  return (
    <SceneDetails
      scene={library.scenes.find(({ id }) => id === pickedSceneId) ?? null}
      isMaster={model.isMaster}
      live={model.live}
      groupSceneId={library.activeSceneId}
      playersOnline={props.tableView.playersOnline}
      now={props.now}
      focusName={model.focusNameId !== null && model.focusNameId === pickedSceneId}
      submit={model.submit}
      onOpen={model.openTab}
    />
  );
}
