import type { CampaignLibraryDto, LibrarySceneDto, SceneFolderDto } from '@lorkarium/contracts';
import { ESTRADA_SCENE, TORRE_SCENE } from './scene-tab-fixtures';
import { VHARN_SCENE } from './table-session-fixtures';

const UPDATED_AT = '2026-10-23T12:00:00.000Z';

export const ATO_1: SceneFolderDto = {
  id: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
  name: 'Ato 1',
  parentId: null,
};

export const CATACUMBAS: SceneFolderDto = {
  id: 'c3c3c3c3-d4d4-4e5e-8f6f-a7a7a7a7a7a7',
  name: 'Catacumbas',
  parentId: ATO_1.id,
};

/** A grid as the library card of the master shows it, built from a board scene.
 *
 *  Example: `libraryScene(TORRE_SCENE, { visibility: 'public' })` */
export function libraryScene(
  scene: Readonly<{ id: string; name: string; widthCells: number; heightCells: number }>,
  overrides: Partial<LibrarySceneDto> = {},
): LibrarySceneDto {
  return {
    id: scene.id,
    name: scene.name,
    folderId: null,
    visibility: 'private',
    widthCells: scene.widthCells,
    heightCells: scene.heightCells,
    background: null,
    tokenCount: 0,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

/** VHARN's library as Ana (master) sees it: the group on Cena 1, the Estrada in "Ato 1" and the
 *  private Torre in "Catacumbas".
 *
 *  Example: `vharnLibrary({ activeSceneId: ESTRADA_SCENE.id })` */
export function vharnLibrary(overrides: Partial<CampaignLibraryDto> = {}): CampaignLibraryDto {
  return {
    images: [],
    activeSceneId: VHARN_SCENE.id,
    folders: [ATO_1, CATACUMBAS],
    scenes: [
      libraryScene(VHARN_SCENE, { visibility: 'public', tokenCount: 2 }),
      libraryScene(ESTRADA_SCENE, { folderId: ATO_1.id, visibility: 'public' }),
      libraryScene(TORRE_SCENE, { folderId: CATACUMBAS.id }),
    ],
    ...overrides,
  };
}

export const LUGARES_FIXOS: SceneFolderDto = {
  id: 'f1f1f1f1-a2a2-4b3b-8c4c-d5d5d5d5d5d5',
  name: 'Lugares fixos',
  parentId: null,
};

/** A private grid of the master, deep in "Ato 1 › Catacumbas", with 14 tokens. */
export const OSSUARIO: LibrarySceneDto = libraryScene(
  { id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', name: 'Ossuário', widthCells: 28, heightCells: 28 },
  { folderId: CATACUMBAS.id, tokenCount: 14 },
);

const ESTRADA_BACKGROUND = {
  assetId: '7c6b5a49-3827-4615-a5f4-e3d2c1b0a9f8',
  width: 1200,
  height: 800,
};

/** VHARN's library as Ana sees it: the group on Cena 1 (no folder), the Estrada with a background
 *  in "Ato 1", the Torre and the Ossuário in "Ato 1 › Catacumbas", and "Lugares fixos" empty.
 *
 *  Example: `masterLibrary({ activeSceneId: OSSUARIO.id })` */
export function masterLibrary(overrides: Partial<CampaignLibraryDto> = {}): CampaignLibraryDto {
  const base = vharnLibrary();
  const [cena, estrada, torre] = base.scenes;
  if (!cena || !estrada || !torre) throw new Error('vharnLibrary() lost a grid');
  return {
    ...base,
    folders: [...base.folders, LUGARES_FIXOS],
    scenes: [cena, { ...estrada, background: ESTRADA_BACKGROUND }, torre, OSSUARIO],
    ...overrides,
  };
}

/** VHARN's library as Bia (player) gets it: the public grids and the group's, no token counts.
 *
 *  Example: `playerLibrary().scenes.length // 2` */
export function playerLibrary(overrides: Partial<CampaignLibraryDto> = {}): CampaignLibraryDto {
  const master = masterLibrary();
  const scenes = master.scenes
    .filter(({ id, visibility }) => visibility === 'public' || id === master.activeSceneId)
    .map((scene) => ({ ...scene, tokenCount: null }));
  return {
    images: [],
    activeSceneId: master.activeSceneId,
    folders: [ATO_1],
    scenes,
    ...overrides,
  };
}

export const PORTRAIT = {
  id: '40d430a4-0657-4ba0-90e5-9df6820f49db',
  name: 'Retrato',
  folderId: null,
  visibility: 'private' as const,
  asset: {
    id: '80c01c4d-268a-4603-a0d0-5470045bf4b6',
    width: 400,
    height: 600,
    mimeType: 'image/png' as const,
  },
  updatedAt: '2026-10-29T12:00:00.000Z',
};
