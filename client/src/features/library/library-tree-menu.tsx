import type {
  DocumentSummaryDto,
  LibraryImageDto,
  LibraryMapSummaryDto,
  LibrarySceneDto,
  SceneFolderDto,
  SheetSummaryDto,
  SheetTemplateSummaryDto,
} from '@lorkarium/contracts';
import { useId, useState, type ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { DeleteConfirmDialog } from './delete-scene-dialog';
import { sceneDeletionText } from './library-messages';
import {
  documentIdOf,
  imageIdOf,
  imageKey,
  mapIdOf,
  sheetIdOf,
  sheetTemplateIdOf,
  type MixedLibrary,
} from '@/lib/library-entries';
import { DeleteMapDialog, MapTreeItems } from './library-map-menu';
import { DeleteSheetTask, SheetTreeItems } from './library-sheet-menu';
import { CreateItems, DeleteTemplateTask, TemplateItems } from './library-template-menu-items';
import type { LibraryOpener } from './use-library-opener';
import type { SheetPlayer } from './use-sheet-holder-names';
import { sceneIdOf, sceneKey } from './library-view';
import { MoveFolderDialog } from './move-folder-dialog';
import type { LibrarySubmit } from './use-library-submit';
import { planHintIdOf } from '@/features/plans/plan-gate';
import { useLibraryPlanGates } from './library-plan-gates';

/** What the master can do in the tree; a player's tree has none of it. */
export type TreeMaster = Readonly<{
  /** The whole library (with the move being sent in place), not the filtered tree. */
  library: MixedLibrary;
  live: boolean;
  submit: LibrarySubmit;
  /** Where "Nova pasta" of the header creates (`null` = the root). */
  newParentId: string | null;
  /** "Criar novo item" in a folder (`null` = the root): opens the "Novo item" dialog. */
  createItem: (folderId: string | null) => void;
  editDocument?: (documentId: string) => void;
  /** "Importar modelo…" in a folder (`null` = the root): picks a `.lksheet` first. */
  importSheetTemplate?: (folderId: string | null) => void;
  /** "Exportar modelo": downloads the saved version as a `.lksheet`. */
  exportSheetTemplate?: (templateId: string) => void;
  openSheet?: LibraryOpener['openSheet'];
  openMap: LibraryOpener['openMap'];
  /** Who "Dar a ▸" offers. */
  players?: readonly SheetPlayer[];
  /** Clears the search and the filter, so the item about to be created shows. */
  resetFilter: () => void;
}>;

export type LibraryTreeMenuProps = Readonly<{
  master: TreeMaster;
  /** A name field is open: right click there is the browser's. */
  disabled: boolean;
  startRename: (key: string) => void;
  focusItem: (key: string) => void;
  /** The area of the tree: right click (or the menu key on an item) opens the menu. */
  children: ReactNode;
}>;

type MenuTask =
  | Readonly<{ kind: 'deleteScene'; scene: LibrarySceneDto }>
  | Readonly<{ kind: 'deleteImage'; image: LibraryImageDto }>
  | Readonly<{ kind: 'deleteMap'; map: LibraryMapSummaryDto }>
  | Readonly<{ kind: 'deleteDocument'; document: DocumentSummaryDto }>
  | Readonly<{ kind: 'deleteTemplate'; template: SheetTemplateSummaryDto }>
  | Readonly<{ kind: 'deleteSheet'; sheet: SheetSummaryDto }>
  | Readonly<{ kind: 'deleteFolder' | 'moveFolder'; folder: SceneFolderDto }>
  | null;

export type MenuActions = LibraryTreeMenuProps & Readonly<{ setTask: (task: MenuTask) => void }>;

/** The master's context menu over the tree: on a folder, on a grid, or on "Sem pasta" and the
 *  empty area (the root). Deleting asks first; everything is disabled while reconnecting.
 *
 *  Example: `<LibraryTreeMenu master={master} disabled={false} … ><div>{tree}</div></LibraryTreeMenu>` */
export function LibraryTreeMenu(props: LibraryTreeMenuProps): React.JSX.Element {
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [task, setTask] = useState<MenuTask>(null);
  return (
    <>
      <ContextMenu modal={false}>
        <ContextMenuTrigger
          asChild
          disabled={props.disabled}
          onContextMenu={(event) => setTargetKey(treeKeyAt(event.target))}
        >
          {props.children}
        </ContextMenuTrigger>
        <ContextMenuContent
          onCloseAutoFocus={(event) => {
            // A dialog or a field took the focus; otherwise it goes back to the item.
            event.preventDefault();
            if (targetKey && document.activeElement === document.body) props.focusItem(targetKey);
          }}
        >
          <TargetItems {...props} targetKey={targetKey} setTask={setTask} />
        </ContextMenuContent>
      </ContextMenu>
      <TaskDialog master={props.master} task={task} onClose={() => setTask(null)} />
    </>
  );
}

function treeKeyAt(target: EventTarget): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest('[data-tree-key]')?.getAttribute('data-tree-key') ?? null;
}

function TargetItems(props: MenuActions & Readonly<{ targetKey: string | null }>) {
  const { library } = props.master;
  const document = library.documents?.find(({ id }) => id === documentIdOf(props.targetKey));
  if (document) return <DocumentItems {...props} document={document} />;
  const map = library.maps?.find(({ id }) => id === mapIdOf(props.targetKey));
  if (map)
    return (
      <MapTreeItems
        master={props.master}
        map={map}
        startRename={props.startRename}
        askDelete={(asked) => props.setTask({ kind: 'deleteMap', map: asked })}
      />
    );
  const sheet = library.sheets?.find(({ id }) => id === sheetIdOf(props.targetKey));
  if (sheet)
    return (
      <SheetTreeItems
        master={props.master}
        sheet={sheet}
        startRename={props.startRename}
        askDelete={(asked) => props.setTask({ kind: 'deleteSheet', sheet: asked })}
      />
    );
  const templateId = sheetTemplateIdOf(props.targetKey);
  const template = library.sheetTemplates?.find(({ id }) => id === templateId);
  if (template) return <TemplateItems {...props} template={template} />;
  const image = library.images?.find(({ id }) => id === imageIdOf(props.targetKey));
  if (image) return <ImageItems {...props} image={image} />;
  const sceneId = sceneIdOf(props.targetKey);
  const scene = library.scenes.find(({ id }) => id === sceneId);
  if (scene) return <SceneItems {...props} scene={scene} />;
  const folder = library.folders.find(({ id }) => id === props.targetKey);
  if (folder) return <FolderItems {...props} folder={folder} />;
  return <CreateItems master={props.master} folderId={null} />;
}

function FolderItems(props: MenuActions & Readonly<{ folder: SceneFolderDto }>) {
  const { master, folder, setTask } = props;
  const off = !master.live;
  return (
    <>
      <CreateItems master={master} folderId={folder.id} />
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={off}
        onSelect={() =>
          void master.submit({
            intent: 'updateFolder',
            folderId: folder.id,
            changes: { visibility: folder.visibility === 'private' ? 'public' : 'private' },
          })
        }
      >
        {folder.visibility === 'private' ? 'Tornar pública' : 'Tornar privada'}
      </ContextMenuItem>
      <ContextMenuItem disabled={off} onSelect={() => props.startRename(folder.id)}>
        Renomear
      </ContextMenuItem>
      <ContextMenuItem disabled={off} onSelect={() => setTask({ kind: 'moveFolder', folder })}>
        Mover para…
      </ContextMenuItem>
      <ContextMenuItem
        variant="destructive"
        disabled={off}
        onSelect={() => setTask({ kind: 'deleteFolder', folder })}
      >
        Excluir pasta
      </ContextMenuItem>
    </>
  );
}

function SceneItems(props: MenuActions & Readonly<{ scene: LibrarySceneDto }>) {
  const { master, scene } = props;
  const reasonId = useId();
  const copyHintId = useId();
  const gates = useLibraryPlanGates();
  const isGroup = scene.id === master.library.activeSceneId;
  const off = !master.live;
  const duplicate = (): void => void master.submit({ intent: 'duplicateScene', sceneId: scene.id });
  return (
    <>
      <ContextMenuItem disabled={off} onSelect={() => props.startRename(sceneKey(scene.id))}>
        Renomear
      </ContextMenuItem>
      <ContextMenuItem
        disabled={off || !gates.duplicate.open}
        aria-describedby={planHintIdOf(gates.duplicate, copyHintId)}
        onSelect={duplicate}
      >
        Duplicar
      </ContextMenuItem>
      {!gates.duplicate.open && (
        <ContextMenuLabel id={copyHintId} className="max-w-56 text-xs font-normal">
          {gates.duplicate.hint}
        </ContextMenuLabel>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        disabled={off || isGroup}
        aria-describedby={isGroup ? reasonId : undefined}
        onSelect={() => props.setTask({ kind: 'deleteScene', scene })}
      >
        Excluir grid
      </ContextMenuItem>
      {isGroup && (
        <ContextMenuLabel id={reasonId} className="max-w-56 text-xs font-normal">
          Leva o grupo pra outro grid antes de excluir este.
        </ContextMenuLabel>
      )}
    </>
  );
}

type TaskDialogProps = Readonly<{ master: TreeMaster; task: MenuTask; onClose: () => void }>;

function TaskDialog({ master, task, onClose }: TaskDialogProps): React.JSX.Element | null {
  if (task?.kind === 'deleteMap')
    return <DeleteMapDialog map={task.map} submit={master.submit} onClose={onClose} />;
  if (task?.kind === 'deleteSheet')
    return <DeleteSheetTask master={master} sheet={task.sheet} onClose={onClose} />;
  if (task?.kind === 'deleteTemplate')
    return <DeleteTemplateTask master={master} template={task.template} onClose={onClose} />;
  if (task?.kind === 'deleteDocument')
    return (
      <DeleteConfirmDialog
        title={`Excluir ${task.document.name}?`}
        description="O documento e seu conteúdo serão excluídos para todos."
        onClose={onClose}
        onConfirm={() =>
          void master.submit({
            intent: 'removeDocument',
            documentId: task.document.id,
            changes: { actionId: crypto.randomUUID(), expectedVersion: task.document.version },
          })
        }
      />
    );
  if (task?.kind === 'deleteImage')
    return (
      <DeleteConfirmDialog
        title={`Excluir ${task.image.name}?`}
        description="A imagem será retirada da biblioteca. Se estiver sendo apresentada, será fechada para todos."
        onClose={onClose}
        onConfirm={() => void master.submit({ intent: 'removeImage', imageId: task.image.id })}
      />
    );
  if (task?.kind === 'deleteScene') {
    return <DeleteSceneTask master={master} scene={task.scene} onClose={onClose} />;
  }
  if (task?.kind === 'deleteFolder') {
    return <DeleteFolderTask master={master} folder={task.folder} onClose={onClose} />;
  }
  if (task?.kind === 'moveFolder') {
    return <MoveFolderTask master={master} folder={task.folder} onClose={onClose} />;
  }
  return null;
}

function DocumentItems(
  props: MenuActions & Readonly<{ document: DocumentSummaryDto }>,
): React.JSX.Element {
  const { master, document } = props;
  return (
    <>
      <ContextMenuItem
        disabled={!master.live || !document.canEdit}
        onSelect={() => master.editDocument?.(document.id)}
      >
        Renomear
      </ContextMenuItem>
      <ContextMenuItem
        variant="destructive"
        disabled={!master.live || !document.canManage}
        onSelect={() => props.setTask({ kind: 'deleteDocument', document })}
      >
        Excluir documento
      </ContextMenuItem>
    </>
  );
}

type SceneTaskProps = Readonly<{ master: TreeMaster; scene: LibrarySceneDto; onClose: () => void }>;

function DeleteSceneTask({ master, scene, onClose }: SceneTaskProps): React.JSX.Element {
  return (
    <DeleteConfirmDialog
      title={`Excluir ${scene.name}?`}
      description={sceneDeletionText(scene.tokenCount)}
      onConfirm={() => void master.submit({ intent: 'removeScene', sceneId: scene.id })}
      onClose={onClose}
    />
  );
}

type FolderTaskProps = Readonly<{
  master: TreeMaster;
  folder: SceneFolderDto;
  onClose: () => void;
}>;

function DeleteFolderTask({ master, folder, onClose }: FolderTaskProps): React.JSX.Element {
  const goesTo = parentName(master.library, folder);
  return (
    <DeleteConfirmDialog
      title={`Excluir a pasta ${folder.name}?`}
      description={`Os grids, as imagens e as pastas de dentro vão para ${goesTo}. Nenhum item é apagado.${revealWarning(master.library, folder)}`}
      onConfirm={() => void master.submit({ intent: 'removeFolder', folderId: folder.id })}
      onClose={onClose}
    />
  );
}

function MoveFolderTask({ master, folder, onClose }: FolderTaskProps): React.JSX.Element {
  const move = (parentId: string | null): void => {
    onClose();
    void master.submit({ intent: 'updateFolder', folderId: folder.id, changes: { parentId } });
  };
  return (
    <MoveFolderDialog folder={folder} library={master.library} onMove={move} onClose={onClose} />
  );
}

// What goes up stops being hidden, unless a private folder above still hides it.
function revealWarning(library: MixedLibrary, folder: SceneFolderDto): string {
  if (folder.visibility !== 'private' || isHiddenAbove(library, folder)) return '';
  return ' Os itens públicos de dentro passam a aparecer para os jogadores.';
}

function isHiddenAbove(library: MixedLibrary, folder: SceneFolderDto): boolean {
  const parent = library.folders.find(({ id }) => id === folder.parentId);
  if (!parent) return false;
  return parent.visibility === 'private' || isHiddenAbove(library, parent);
}

function parentName(library: MixedLibrary, folder: SceneFolderDto): string {
  return library.folders.find(({ id }) => id === folder.parentId)?.name ?? 'Sem pasta';
}

function ImageItems(props: MenuActions & Readonly<{ image: LibraryImageDto }>): React.JSX.Element {
  const { master, image } = props;
  return (
    <>
      <ContextMenuItem
        disabled={!master.live}
        onSelect={() => props.startRename(imageKey(image.id))}
      >
        Renomear
      </ContextMenuItem>
      <ContextMenuItem
        variant="destructive"
        disabled={!master.live}
        onSelect={() => props.setTask({ kind: 'deleteImage', image })}
      >
        Excluir imagem
      </ContextMenuItem>
    </>
  );
}
