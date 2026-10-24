import { describe, expect, it } from 'vitest';
import type { LibraryTree } from '@/features/library/folder-tree-nav';
import { NO_FOLDER, sceneKey } from '@/features/library/library-view';
import {
  ancestorKeysOf,
  expandableKeysOf,
  treeMove,
  visibleTreeItems,
} from '@/features/library/tree-navigation';
import { folderTreeOf } from '@/lib/folder-tree';
import {
  ATO_1,
  CATACUMBAS,
  LUGARES_FIXOS,
  OSSUARIO,
  masterLibrary,
} from '../../support/library-fixtures';
import { ESTRADA_SCENE, TORRE_SCENE } from '../../support/scene-tab-fixtures';
import { VHARN_SCENE } from '../../support/table-session-fixtures';

const OSSOS = {
  id: '0a0a0a0a-1b1b-4c2c-8d3d-4e4e4e4e4e4e',
  name: 'Ossos',
  parentId: CATACUMBAS.id,
};

// Ato 1 (Estrada) › Catacumbas (Torre, Ossuário) › Ossos (empty); Lugares fixos; Cena 1 loose.
function vharnTree(): LibraryTree {
  const library = masterLibrary();
  return folderTreeOf({ ...library, folders: [...library.folders, OSSOS] }, null);
}

function keysOf(expanded: readonly string[]): string[] {
  return visibleTreeItems(vharnTree(), new Set(expanded)).map(({ key }) => key);
}

describe('visibleTreeItems', () => {
  it('with nothing expanded shows the root folders and "Sem pasta"', () => {
    expect(keysOf([])).toEqual([ATO_1.id, LUGARES_FIXOS.id, NO_FOLDER]);
  });

  it('inside an expanded folder shows its folders first, then its grids', () => {
    expect(keysOf([ATO_1.id, CATACUMBAS.id])).toEqual([
      ATO_1.id,
      CATACUMBAS.id,
      OSSOS.id,
      sceneKey(TORRE_SCENE.id),
      sceneKey(OSSUARIO.id),
      sceneKey(ESTRADA_SCENE.id),
      LUGARES_FIXOS.id,
      NO_FOLDER,
    ]);
  });

  it('an expanded "Sem pasta" shows the grids without folder after it', () => {
    expect(keysOf([NO_FOLDER])).toEqual([
      ATO_1.id,
      LUGARES_FIXOS.id,
      NO_FOLDER,
      sceneKey(VHARN_SCENE.id),
    ]);
  });

  it('a grid is a leaf under its folder; an empty folder cannot expand', () => {
    const items = visibleTreeItems(vharnTree(), new Set([ATO_1.id, CATACUMBAS.id]));
    expect(items.find(({ key }) => key === sceneKey(TORRE_SCENE.id))).toEqual({
      key: sceneKey(TORRE_SCENE.id),
      parentKey: CATACUMBAS.id,
      hasChildren: false,
    });
    expect(items.find(({ key }) => key === OSSOS.id)?.hasChildren).toBe(false);
    expect(items.find(({ key }) => key === ATO_1.id)?.hasChildren).toBe(true);
  });
});

describe('treeMove', () => {
  const expanded = new Set([ATO_1.id]);
  const items = visibleTreeItems(vharnTree(), expanded);
  const estrada = sceneKey(ESTRADA_SCENE.id);

  it('down from a folder walks into its first child, and on to its grids', () => {
    expect(treeMove(items, ATO_1.id, 'ArrowDown', expanded)).toEqual({
      kind: 'focus',
      key: CATACUMBAS.id,
    });
    expect(treeMove(items, CATACUMBAS.id, 'ArrowDown', expanded)).toEqual({
      kind: 'focus',
      key: estrada,
    });
  });

  it('left on a grid goes up to its folder; right on a grid does nothing', () => {
    expect(treeMove(items, estrada, 'ArrowLeft', expanded)).toEqual({
      kind: 'focus',
      key: ATO_1.id,
    });
    expect(treeMove(items, estrada, 'ArrowRight', expanded)).toBeNull();
  });

  it('Home and End go to the first folder and to "Sem pasta"', () => {
    expect(treeMove(items, estrada, 'Home', expanded)).toEqual({ kind: 'focus', key: ATO_1.id });
    expect(treeMove(items, estrada, 'End', expanded)).toEqual({ kind: 'focus', key: NO_FOLDER });
  });
});

describe('ancestorKeysOf', () => {
  it('lists the folders above a nested one, from the root down', () => {
    expect(ancestorKeysOf(vharnTree(), OSSOS.id)).toEqual([ATO_1.id, CATACUMBAS.id]);
    expect(ancestorKeysOf(vharnTree(), CATACUMBAS.id)).toEqual([ATO_1.id]);
  });

  it('lists every folder a grid sits in, its own included', () => {
    expect(ancestorKeysOf(vharnTree(), sceneKey(OSSUARIO.id))).toEqual([ATO_1.id, CATACUMBAS.id]);
  });

  it('puts a grid without folder under "Sem pasta"', () => {
    expect(ancestorKeysOf(vharnTree(), sceneKey(VHARN_SCENE.id))).toEqual([NO_FOLDER]);
  });

  it('is empty for a root folder, "Sem pasta" and a key the tree lacks', () => {
    expect(ancestorKeysOf(vharnTree(), LUGARES_FIXOS.id)).toEqual([]);
    expect(ancestorKeysOf(vharnTree(), NO_FOLDER)).toEqual([]);
    expect(ancestorKeysOf(vharnTree(), 'f0f0f0f0-0000-4000-8000-000000000000')).toEqual([]);
    expect(ancestorKeysOf(vharnTree(), sceneKey('f0f0f0f0-0000-4000-8000-000000000000'))).toEqual(
      [],
    );
  });
});

describe('expandableKeysOf', () => {
  it('lists every folder, nested ones included, and "Sem pasta"', () => {
    expect(expandableKeysOf(vharnTree())).toEqual([
      ATO_1.id,
      CATACUMBAS.id,
      OSSOS.id,
      LUGARES_FIXOS.id,
      NO_FOLDER,
    ]);
  });
});
