import type { LibraryImageDto } from '@lorkarium/contracts';
import { useState, type ReactNode } from 'react';
import {
  documentIdOf,
  imageIdOf,
  mapIdOf,
  sheetIdOf,
  sheetTemplateIdOf,
  type MixedLibrary,
} from '@/lib/library-entries';
import { ImageViewerModal } from './image-viewer';
import { sceneIdOf } from './library-view';
import type { LibraryOpener } from './use-library-opener';

type ItemOpenPorts = Readonly<{
  library: MixedLibrary;
  isMaster: boolean;
  /** A grid in a room tab, back in the room ("Abrir pra preparar"). */
  openTab: (sceneId: string) => void;
  opener: LibraryOpener;
}>;

/** What a double click (or Enter) on a tree item does, and the image viewer it may open. */
export type LibraryItemOpen = Readonly<{
  open: (key: string) => void;
  /** The image open in the viewer, or nothing. */
  viewing: ReactNode;
}>;

/** Opens an item of the tree where its panel's "Abrir" would: a grid, document, sheet, template
 *  or map in a room tab; an image in the viewer (it has no tab). A folder opens nothing.
 *
 *  Example: `const openItem = useLibraryItemOpen({ library, isMaster, openTab, opener }); openItem.open(key)` */
export function useLibraryItemOpen(ports: ItemOpenPorts): LibraryItemOpen {
  const [image, setImage] = useState<LibraryImageDto | null>(null);
  const viewing = image && <ImageViewerModal image={image} onClose={() => setImage(null)} />;
  return {
    viewing,
    open: (key) => {
      const shown = ports.library.images?.find(({ id }) => id === imageIdOf(key));
      if (shown) return setImage(shown);
      openInRoom(ports, key);
    },
  };
}

function openInRoom({ library, isMaster, openTab, opener }: ItemOpenPorts, key: string): void {
  const sceneId = sceneIdOf(key);
  if (library.scenes.some(({ id }) => id === sceneId) && sceneId) return openTab(sceneId);
  const document = library.documents?.find(({ id }) => id === documentIdOf(key));
  if (document) return opener.openDocument(document, false, false);
  const sheet = library.sheets?.find(({ id }) => id === sheetIdOf(key));
  if (sheet) return opener.openSheet(sheet, false);
  const map = library.maps?.find(({ id }) => id === mapIdOf(key));
  if (map) return opener.openMap(map);
  const template = library.sheetTemplates?.find(({ id }) => id === sheetTemplateIdOf(key));
  if (template && isMaster) opener.openSheetTemplate(template);
}
