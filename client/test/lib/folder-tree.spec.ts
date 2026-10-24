import { describe, expect, it } from 'vitest';
import { canDrop, filteredTreeOf, folderTreeOf } from '@/lib/folder-tree';

type Folder = { id: string; name: string; parentId: string | null };
type Scene = {
  id: string;
  name: string;
  folderId: string | null;
  visibility: 'public' | 'private';
};

const ATO_1: Folder = { id: 'ato-1', name: 'Ato 1', parentId: null };
const ATO_2: Folder = { id: 'ato-2', name: 'Ato 2', parentId: null };
const CATACUMBAS: Folder = { id: 'catacumbas', name: 'Catacumbas', parentId: 'ato-2' };
const CRIPTA: Folder = { id: 'cripta', name: 'Cripta', parentId: 'catacumbas' };
const FIXOS: Folder = { id: 'fixos', name: 'Lugares fixos', parentId: null };

const ESTRADA: Scene = {
  id: 'estrada',
  name: 'Estrada de Vharn',
  folderId: 'ato-1',
  visibility: 'public',
};
const OSSUARIO: Scene = {
  id: 'ossuario',
  name: 'Ossuário',
  folderId: 'catacumbas',
  visibility: 'private',
};
const ALTAR: Scene = { id: 'altar', name: 'Altar', folderId: 'cripta', visibility: 'public' };
const TAVERNA: Scene = { id: 'taverna', name: 'Taverna', folderId: null, visibility: 'public' };

const LIBRARY = {
  folders: [ATO_1, ATO_2, CATACUMBAS, CRIPTA, FIXOS],
  scenes: [ESTRADA, OSSUARIO, ALTAR, TAVERNA],
};

// A chain of `levels` folders, each inside the previous one: f1 ⊃ f2 ⊃ …
function chainOfFolders(levels: number): Folder[] {
  return Array.from({ length: levels }, (_, index) => ({
    id: `f${index + 1}`,
    name: `Nível ${index + 1}`,
    parentId: index === 0 ? null : `f${index}`,
  }));
}

describe('folderTreeOf', () => {
  it('nests the folders under their parents in creation order', () => {
    const tree = folderTreeOf(LIBRARY, null);
    expect(tree.roots.map(({ folder }) => folder.name)).toEqual([
      'Ato 1',
      'Ato 2',
      'Lugares fixos',
    ]);
    const ato2 = tree.roots[1];
    expect(ato2?.children.map(({ folder }) => folder.name)).toEqual(['Catacumbas']);
    expect(ato2?.children[0]?.children.map(({ folder }) => folder.name)).toEqual(['Cripta']);
  });

  it('gives a root folder depth 1 and each level one more', () => {
    const catacumbas = folderTreeOf(LIBRARY, null).roots[1]?.children[0];
    expect(catacumbas?.depth).toBe(2);
    expect(catacumbas?.children[0]?.depth).toBe(3);
  });

  it('keeps each grid in its own folder and the folderless ones in "Sem pasta"', () => {
    const tree = folderTreeOf(LIBRARY, null);
    expect(tree.roots[0]?.scenes).toEqual([ESTRADA]);
    expect(tree.looseScenes).toEqual([TAVERNA]);
  });

  it('counts the grids of a folder together with those of its descendants', () => {
    const tree = folderTreeOf(LIBRARY, null);
    expect(tree.roots[1]?.sceneCount).toBe(2);
    expect(tree.roots[2]?.sceneCount).toBe(0);
  });

  it('marks the folder of the group grid and every ancestor as live, and no other', () => {
    const tree = folderTreeOf(LIBRARY, 'altar');
    const ato2 = tree.roots[1];
    expect(ato2?.holdsGroupGrid).toBe(true);
    expect(ato2?.children[0]?.holdsGroupGrid).toBe(true);
    expect(ato2?.children[0]?.children[0]?.holdsGroupGrid).toBe(true);
    expect(tree.roots[0]?.holdsGroupGrid).toBe(false);
  });

  it('marks no folder live when the group grid has no folder', () => {
    const tree = folderTreeOf(LIBRARY, 'taverna');
    expect(tree.roots.some(({ holdsGroupGrid }) => holdsGroupGrid)).toBe(false);
  });
});

describe('filteredTreeOf', () => {
  function namesOf(tree: ReturnType<typeof filteredTreeOf<Folder, Scene>>): string[] {
    const walk = (nodes: typeof tree.roots): string[] =>
      nodes.flatMap((node) => [
        node.folder.name,
        ...walk(node.children),
        ...node.scenes.map(({ name }) => name),
      ]);
    return [...walk(tree.roots), ...tree.looseScenes.map(({ name }) => name)];
  }

  it('with no query and no filter is the whole tree, empty folders included', () => {
    const tree = filteredTreeOf(LIBRARY, null, { query: '  ', visibility: 'all' });
    expect(tree).toEqual(folderTreeOf(LIBRARY, null));
  });

  it('"ossuario" keeps the Ossuário and only the folders above it, ignoring accent and case', () => {
    const tree = filteredTreeOf(LIBRARY, null, { query: 'OSSUARIO', visibility: 'all' });
    expect(namesOf(tree)).toEqual(['Ato 2', 'Catacumbas', 'Ossuário']);
    expect(tree.roots[0]?.sceneCount).toBe(1);
  });

  it('keeps a matching grid without folder in "Sem pasta"', () => {
    const tree = filteredTreeOf(LIBRARY, null, { query: 'tav', visibility: 'all' });
    expect(tree.roots).toEqual([]);
    expect(tree.looseScenes).toEqual([TAVERNA]);
  });

  it.each([
    ['private', ['Ato 2', 'Catacumbas', 'Ossuário']],
    ['public', ['Ato 1', 'Estrada de Vharn', 'Ato 2', 'Catacumbas', 'Cripta', 'Altar', 'Taverna']],
  ] as const)('the %s filter keeps only those grids and their folders', (visibility, names) => {
    expect(namesOf(filteredTreeOf(LIBRARY, null, { query: '', visibility }))).toEqual(names);
  });

  it('combines the query with the filter', () => {
    const tree = filteredTreeOf(LIBRARY, null, { query: 'a', visibility: 'private' });
    expect(namesOf(tree)).toEqual(['Ato 2', 'Catacumbas', 'Ossuário']);
  });

  it('a query nobody matches leaves no folder and no grid', () => {
    const tree = filteredTreeOf(LIBRARY, null, { query: 'dragão', visibility: 'all' });
    expect(tree).toEqual({ roots: [], looseScenes: [] });
  });
});

describe('canDrop', () => {
  it('refuses dropping a folder on itself', () => {
    expect(canDrop(LIBRARY.folders, { kind: 'folder', id: 'ato-2' }, 'ato-2')).toBe(false);
  });

  it('refuses dropping a folder on one of its descendants', () => {
    expect(canDrop(LIBRARY.folders, { kind: 'folder', id: 'ato-2' }, 'cripta')).toBe(false);
  });

  it('accepts moving a folder into a sibling or to the root', () => {
    expect(canDrop(LIBRARY.folders, { kind: 'folder', id: 'catacumbas' }, 'fixos')).toBe(true);
    expect(canDrop(LIBRARY.folders, { kind: 'folder', id: 'catacumbas' }, null)).toBe(true);
  });

  it('accepts a folder that lands exactly on the 5th level', () => {
    const folders = [...chainOfFolders(4), { id: 'solta', name: 'Solta', parentId: null }];
    expect(canDrop(folders, { kind: 'folder', id: 'solta' }, 'f4')).toBe(true);
  });

  it('refuses a folder that would land on the 6th level', () => {
    const folders = [...chainOfFolders(5), { id: 'solta', name: 'Solta', parentId: null }];
    expect(canDrop(folders, { kind: 'folder', id: 'solta' }, 'f5')).toBe(false);
  });

  it('refuses a folder whose own subfolders would pass the 5th level', () => {
    const folders = [...chainOfFolders(3), ATO_2, CATACUMBAS, CRIPTA];
    expect(canDrop(folders, { kind: 'folder', id: 'ato-2' }, 'f3')).toBe(false);
  });

  it('takes the depth limit by parameter', () => {
    expect(canDrop(LIBRARY.folders, { kind: 'folder', id: 'fixos' }, 'cripta', 3)).toBe(false);
  });

  it('always accepts a grid, in any folder or "Sem pasta"', () => {
    const folders = chainOfFolders(5);
    expect(canDrop(folders, { kind: 'scene', id: 'ossuario' }, 'f5')).toBe(true);
    expect(canDrop(folders, { kind: 'scene', id: 'ossuario' }, null)).toBe(true);
  });
});
