import { useState } from 'react';
import { useRevalidator } from 'react-router';
import { imageKey, mapKey } from '@/lib/library-entries';
import type { LibraryIntent } from './library-intents';
import type { NewItemCreators } from './new-item-dialog';
import type { LibrarySubmit } from './use-library-submit';

type NewItemPorts = Readonly<{
  submit: LibrarySubmit;
  /** Clears the search and the filter, so the item about to be created shows. */
  beforeCreate: () => void;
  pick: (key: string) => void;
  createSheetTemplate: (folderId: string | null, name: string) => void;
  chooseTemplateFile: (folderId: string | null) => void;
}>;

export type NewItem = Readonly<{
  /** The folder of the "Novo item" open (`null` = the root); `undefined` = closed. */
  folderId: string | null | undefined;
  open: (folderId: string | null) => void;
  close: () => void;
  create: NewItemCreators;
}>;

/** Whether "Novo item" is open and how each of its types reaches the server.
 *
 *  Example: `const newItem = useNewItem({ submit, beforeCreate, pick, createSheetTemplate, chooseTemplateFile })` */
export function useNewItem(ports: NewItemPorts): NewItem {
  const [folderId, setFolderId] = useState<string | null | undefined>(undefined);
  const { revalidate } = useRevalidator();
  const send = (intent: LibraryIntent): void => {
    ports.beforeCreate();
    void ports.submit(intent);
  };
  const saved = (key: string): void => {
    ports.beforeCreate();
    ports.pick(key);
    void revalidate();
  };
  const create: NewItemCreators = {
    grid: (folder, name) => send({ intent: 'createScene', folderId: folder, ...typed(name) }),
    document: (folder, name) =>
      send({
        intent: 'createDocument',
        changes: { actionId: crypto.randomUUID(), folderId: folder, ...typed(name) },
      }),
    folder: (parentId, name, visibility) =>
      send({ intent: 'createFolder', folder: { name, parentId, visibility } }),
    sheet: (sheet) => send({ intent: 'createSheet', sheet }),
    sheetTemplate: ports.createSheetTemplate,
    importSheetTemplate: ports.chooseTemplateFile,
    imageSaved: (image) => saved(imageKey(image.id)),
    mapSaved: (map) => saved(mapKey(map.id)),
  };
  return { folderId, open: setFolderId, close: () => setFolderId(undefined), create };
}

// A blank name stays out of the request: the server gives the type's own "… sem nome".
function typed(name: string): Readonly<{ name?: string }> {
  return name === '' ? {} : { name };
}
