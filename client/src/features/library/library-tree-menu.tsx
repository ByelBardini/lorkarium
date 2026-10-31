import type {
  DocumentSummaryDto,
  LibraryImageDto,
  LibrarySceneDto,
  SceneFolderDto,
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
import { documentIdOf, imageIdOf, imageKey, type MixedLibrary } from '@/lib/library-entries';
import { sceneIdOf, sceneKey } from './library-view';
import { MoveFolderDialog } from './move-folder-dialog';
import type { LibrarySubmit } from './use-library-submit';

/** What the master can do in the tree; a player's tree has none of it. */
export type TreeMaster = Readonly<{
  /** The whole library (with the move being sent in place), not the filtered tree. */
  library: MixedLibrary;
  live: boolean;
  submit: LibrarySubmit;
  /** Where "Nova pasta" of the header creates (`null` = the root). */
  newParentId: string | null;
  /** "Novo grid" in a folder (`null` = the root): the new grid gets picked. */
  createGrid: (folderId: string | null) => void;
  createImage?: (folderId: string | null) => void;
  createDocument?: (folderId: string | null) => void;
  editDocument?: (documentId: string) => void;
  /** Clears the search and the filter, so the item about to be created shows. */
  resetFilter: () => void;
}>;

export type LibraryTreeMenuProps = Readonly<{
  master: TreeMaster;
  /** A name field is open: right click there is the browser's. */
  disabled: boolean;
  startRename: (key: string) => void;
  startNewFolder: (parentId: string | null) => void;
  focusItem: (key: string) => void;
  /** The area of the tree: right click (or the menu key on an item) opens the menu. */
  children: ReactNode;
}>;

type MenuTask =
  | Readonly<{ kind: 'deleteScene'; scene: LibrarySceneDto }>
  | Readonly<{ kind: 'deleteImage'; image: LibraryImageDto }>
  | Readonly<{ kind: 'deleteDocument'; document: DocumentSummaryDto }>
  | Readonly<{ kind: 'deleteFolder' | 'moveFolder'; folder: SceneFolderDto }>
  | null;

type MenuActions = LibraryTreeMenuProps & Readonly<{ setTask: (task: MenuTask) => void }>;

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
  const image = library.images?.find(({ id }) => id === imageIdOf(props.targetKey));
  if (image) return <ImageItems {...props} image={image} />;
  const sceneId = sceneIdOf(props.targetKey);
  const scene = library.scenes.find(({ id }) => id === sceneId);
  if (scene) return <SceneItems {...props} scene={scene} />;
  const folder = library.folders.find(({ id }) => id === props.targetKey);
  if (folder) return <FolderItems {...props} folder={folder} />;
  return <RootItems {...props} />;
}

function RootItems({ master, startNewFolder }: MenuActions): React.JSX.Element {
  return (
    <>
      <ContextMenuItem disabled={!master.live} onSelect={() => master.createGrid(null)}>
        Novo grid
      </ContextMenuItem>
      {master.createImage && (
        <ContextMenuItem disabled={!master.live} onSelect={() => master.createImage?.(null)}>
          Nova imagem
        </ContextMenuItem>
      )}
      {master.createDocument && (
        <ContextMenuItem disabled={!master.live} onSelect={() => master.createDocument?.(null)}>
          Novo documento
        </ContextMenuItem>
      )}
      <ContextMenuItem
        disabled={!master.live}
        onSelect={() => {
          master.resetFilter();
          startNewFolder(null);
        }}
      >
        Nova pasta
      </ContextMenuItem>
    </>
  );
}

function FolderItems(props: MenuActions & Readonly<{ folder: SceneFolderDto }>) {
  const { master, folder, setTask } = props;
  const off = !master.live;
  return (
    <>
      <ContextMenuItem disabled={off} onSelect={() => master.createGrid(folder.id)}>
        Novo grid aqui
      </ContextMenuItem>
      {master.createImage && (
        <ContextMenuItem disabled={off} onSelect={() => master.createImage?.(folder.id)}>
          Nova imagem aqui
        </ContextMenuItem>
      )}
      {master.createDocument && (
        <ContextMenuItem disabled={off} onSelect={() => master.createDocument?.(folder.id)}>
          Novo documento aqui
        </ContextMenuItem>
      )}
      <ContextMenuItem
        disabled={off}
        onSelect={() => {
          master.resetFilter();
          props.startNewFolder(folder.id);
        }}
      >
        Nova pasta aqui
      </ContextMenuItem>
      <ContextMenuSeparator />
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
  const isGroup = scene.id === master.library.activeSceneId;
  const off = !master.live;
  const duplicate = (): void => void master.submit({ intent: 'duplicateScene', sceneId: scene.id });
  return (
    <>
      <ContextMenuItem disabled={off} onSelect={() => props.startRename(sceneKey(scene.id))}>
        Renomear
      </ContextMenuItem>
      <ContextMenuItem disabled={off} onSelect={duplicate}>
        Duplicar
      </ContextMenuItem>
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
      description={`Os grids, as imagens e as pastas de dentro vão para ${goesTo}. Nenhum item é apagado.`}
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
