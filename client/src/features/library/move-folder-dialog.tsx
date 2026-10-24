import type { LibraryDto, SceneFolderDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { canDrop, folderTreeOf } from '@/lib/folder-tree';
import { FolderPicker } from './folder-picker';

export type MoveFolderDialogProps = Readonly<{
  folder: SceneFolderDto;
  /** The whole library (not the filtered tree): every folder is a destination. */
  library: LibraryDto;
  onMove: (parentId: string | null) => void;
  onClose: () => void;
}>;

/** "Mover Ato 1": the folder picker without the destinations the folder cannot enter; "Mover"
 *  to where it already is just closes.
 *
 *  Example: `<MoveFolderDialog folder={ato1} library={library} onMove={move} onClose={close} />` */
export function MoveFolderDialog({ folder, library, onMove, onClose }: MoveFolderDialogProps) {
  const [target, setTarget] = useState(folder.parentId);
  const dragged = { kind: 'folder', id: folder.id } as const;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-2xl">{`Mover ${folder.name}`}</DialogTitle>
        </DialogHeader>
        <FolderPicker
          label="Para dentro de"
          tree={folderTreeOf(library, null)}
          value={target}
          onChange={setTarget}
          allows={(id) => canDrop(library.folders, dragged, id)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => (target === folder.parentId ? onClose() : onMove(target))}>
            Mover
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
