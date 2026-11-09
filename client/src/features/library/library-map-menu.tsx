import type { LibraryMapSummaryDto } from '@lorkarium/contracts';
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import { mapKey } from '@/lib/library-entries';
import { DeleteConfirmDialog } from './delete-scene-dialog';
import type { TreeMaster } from './library-tree-menu';
import type { LibrarySubmit } from './use-library-submit';

type MapTreeItemsProps = Readonly<{
  master: TreeMaster;
  map: LibraryMapSummaryDto;
  startRename: (key: string) => void;
  askDelete: (map: LibraryMapSummaryDto) => void;
}>;

/** The menu over a map in the tree.
 *
 *  Example: `<MapTreeItems master={master} map={map} startRename={rename} askDelete={ask} />` */
export function MapTreeItems({ master, map, startRename, askDelete }: MapTreeItemsProps) {
  const off = !master.live;
  const toggleMain = (): void =>
    void master.submit({ intent: map.isMain ? 'unsetMainMap' : 'setMainMap', mapId: map.id });
  return (
    <>
      <ContextMenuItem onSelect={() => master.openMap(map)}>Abrir</ContextMenuItem>
      <ContextMenuItem disabled={off} onSelect={() => startRename(mapKey(map.id))}>
        Renomear
      </ContextMenuItem>
      <ContextMenuItem disabled={off} onSelect={toggleMain}>
        {map.isMain ? 'Deixar de ser principal' : 'Marcar como principal'}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" disabled={off} onSelect={() => askDelete(map)}>
        Excluir mapa
      </ContextMenuItem>
    </>
  );
}

type DeleteMapDialogProps = Readonly<{
  map: LibraryMapSummaryDto;
  submit: LibrarySubmit;
  onClose: () => void;
}>;

/** Asks before deleting a map; the server refuses the main one.
 *
 *  Example: `<DeleteMapDialog map={map} submit={submit} onClose={close} />` */
export function DeleteMapDialog({ map, submit, onClose }: DeleteMapDialogProps) {
  return (
    <DeleteConfirmDialog
      title={`Excluir ${map.name}?`}
      description="O mapa e os lugares marcados nele somem para todos. Os itens ligados continuam na biblioteca."
      onClose={onClose}
      onConfirm={() => void submit({ intent: 'removeMap', mapId: map.id })}
    />
  );
}
