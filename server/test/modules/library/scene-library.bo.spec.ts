import { SCENE_FOLDER_DEPTH_MAX } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import {
  SceneLibraryBo,
  sceneCopyName,
  type LibraryFolderState,
  type LibrarySceneState,
} from '../../../src/modules/library/scene-library.bo';
import { SceneAccessBo } from '../../../src/modules/scenes/scene-access.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';

function folder(id: string, parentId: string | null = null): LibraryFolderState {
  return { id, parentId };
}

function scene(id: string, folderId: string | null, visibility: 'private' | 'public') {
  return { id, folderId, visibility } satisfies LibrarySceneState;
}

// Ato 1 › Masmorra · Ato 2 (only private grids) · Mundo › Cidades · d1 › d2 › d3 › d4 › d5 · s1 › s2
const FOLDERS = [
  folder('ato-1'),
  folder('masmorra', 'ato-1'),
  folder('ato-2'),
  folder('mundo'),
  folder('cidades', 'mundo'),
  folder('d1'),
  folder('d2', 'd1'),
  folder('d3', 'd2'),
  folder('d4', 'd3'),
  folder('d5', 'd4'),
  folder('s1'),
  folder('s2', 's1'),
];

const SALAO = scene('salao', 'masmorra', 'private');
const CRIPTA = scene('cripta', 'ato-1', 'private');
const OSSUARIO = scene('ossuario', 'ato-2', 'private');
const ESTRADA = scene('estrada', 'cidades', 'public');
const TORRE = scene('torre', null, 'public');
const SCENES = [SALAO, CRIPTA, OSSUARIO, ESTRADA, TORRE];

const LIBRARY = new SceneLibraryBo({
  campaignId: VHARN_ID,
  activeSceneId: SALAO.id,
  maxFolderDepth: SCENE_FOLDER_DEPTH_MAX,
  folders: FOLDERS,
  scenes: SCENES,
});

function accessOf(userId: string, role: 'master' | 'player'): SceneAccessBo {
  return new SceneAccessBo(new CampaignAccessBo({ campaignId: VHARN_ID, userId, role }), SALAO.id);
}

describe('SceneLibraryBo.requireMove', () => {
  it('moving Masmorra to the root passes', () => {
    expect(() => LIBRARY.requireMove('masmorra', null)).not.toThrow();
  });

  it('a subtree of 2 levels under the 3rd level ends at the 5th and passes', () => {
    expect(() => LIBRARY.requireMove('s1', 'd3')).not.toThrow();
  });

  it.each([
    ['into itself', 'ato-1', 'ato-1'],
    ['into its own subfolder', 'ato-1', 'masmorra'],
    ['into a deeper descendant', 'd1', 'd4'],
  ])('moving a folder %s is FOLDER_CYCLE citing both folders', (_case, folderId, parentId) => {
    expect(() => LIBRARY.requireMove(folderId, parentId)).toThrow(
      expect.objectContaining({
        code: 'FOLDER_CYCLE',
        message: expect.stringMatching(new RegExp(`${folderId}.*${parentId}`)),
      }),
    );
  });

  it('a subtree of 2 levels under the 4th level is FOLDER_TOO_DEEP at 6 levels', () => {
    expect(() => LIBRARY.requireMove('s1', 'd4')).toThrow(
      expect.objectContaining({
        code: 'FOLDER_TOO_DEEP',
        message: expect.stringContaining('would be 6 levels deep; expected at most 5'),
      }),
    );
  });

  it.each([
    ['the folder', 'quelm-folder', null],
    ['the new parent', 'masmorra', 'quelm-folder'],
  ])('%s outside this table is FOLDER_NOT_FOUND', (_case, folderId, parentId) => {
    expect(() => LIBRARY.requireMove(folderId, parentId)).toThrow(
      expect.objectContaining({
        code: 'FOLDER_NOT_FOUND',
        message: expect.stringMatching(new RegExp(`${VHARN_ID}.*quelm-folder`)),
      }),
    );
  });
});

describe('SceneLibraryBo.requireCreateIn', () => {
  it('creating at the root and at the 5th level passes', () => {
    expect(() => LIBRARY.requireCreateIn(null)).not.toThrow();
    expect(() => LIBRARY.requireCreateIn('d4')).not.toThrow();
  });

  it('creating at the 6th level is FOLDER_TOO_DEEP', () => {
    expect(() => LIBRARY.requireCreateIn('d5')).toThrow(
      expect.objectContaining({
        code: 'FOLDER_TOO_DEEP',
        message: expect.stringContaining('would be 6 levels deep; expected at most 5'),
      }),
    );
  });

  it('a parent outside this table is FOLDER_NOT_FOUND', () => {
    expect(() => LIBRARY.requireCreateIn('quelm-folder')).toThrow(
      expect.objectContaining({ code: 'FOLDER_NOT_FOUND' }),
    );
  });
});

describe('SceneLibraryBo.removal', () => {
  it('removing Ato 1 lifts its subfolder and its grid to the root', () => {
    expect(LIBRARY.removal('ato-1')).toEqual({
      folderId: 'ato-1',
      parentId: null,
      childFolderIds: ['masmorra'],
      sceneIds: [CRIPTA.id],
    });
  });

  it('removing Masmorra lifts its grid to Ato 1', () => {
    expect(LIBRARY.removal('masmorra')).toEqual({
      folderId: 'masmorra',
      parentId: 'ato-1',
      childFolderIds: [],
      sceneIds: [SALAO.id],
    });
  });

  it('a folder outside this table is FOLDER_NOT_FOUND', () => {
    expect(() => LIBRARY.removal('quelm-folder')).toThrow(
      expect.objectContaining({ code: 'FOLDER_NOT_FOUND' }),
    );
  });
});

describe('SceneLibraryBo.requireKnown', () => {
  it('the root and a folder five levels deep both take a grid', () => {
    expect(() => LIBRARY.requireKnown(null)).not.toThrow();
    expect(() => LIBRARY.requireKnown('d5')).not.toThrow();
  });

  it('a folder outside this table is FOLDER_NOT_FOUND citing it and the table', () => {
    expect(() => LIBRARY.requireKnown('quelm-folder')).toThrow(
      expect.objectContaining({
        code: 'FOLDER_NOT_FOUND',
        message: `campaign ${VHARN_ID} has no scene folder quelm-folder`,
      }),
    );
  });
});

describe('SceneLibraryBo.requireDeletable', () => {
  it('a grid that is not the group one may be deleted', () => {
    expect(() => LIBRARY.requireDeletable(TORRE.id)).not.toThrow();
  });

  it('the group grid is SCENE_IS_ACTIVE citing the grid and the table', () => {
    expect(() => LIBRARY.requireDeletable(SALAO.id)).toThrow(
      expect.objectContaining({
        code: 'SCENE_IS_ACTIVE',
        message: expect.stringMatching(new RegExp(`${SALAO.id}.*${VHARN_ID}`)),
      }),
    );
  });
});

describe('SceneLibraryBo.visibleTo', () => {
  it('Bia sees the public grids, the group one and the folders that lead to them', () => {
    const visible = LIBRARY.visibleTo(accessOf(BIA_ID, 'player'));
    expect(visible.scenes).toEqual([SALAO, ESTRADA, TORRE]);
    expect(visible.folders.map(({ id }) => id)).toEqual(['ato-1', 'masmorra', 'mundo', 'cidades']);
  });

  it('Ana, the master, sees every grid and every folder, empty ones included', () => {
    const visible = LIBRARY.visibleTo(accessOf(ANA_ID, 'master'));
    expect(visible.scenes).toEqual(SCENES);
    expect(visible.folders).toEqual(FOLDERS);
  });
});

describe('sceneCopyName', () => {
  it('adds the suffix to the name', () => {
    expect(sceneCopyName('Salão do Sino', ' (cópia)', 60)).toBe('Salão do Sino (cópia)');
  });

  it('a name of 60 characters is cut so the suffix fits in 60', () => {
    const copy = sceneCopyName(`${'a'.repeat(51)} ${'b'.repeat(8)}`, ' (cópia)', 60);

    expect(copy).toBe(`${'a'.repeat(51)} (cópia)`);
    expect(copy).toHaveLength(59);
  });

  it('a name that fills the limit exactly with the suffix is kept whole', () => {
    expect(sceneCopyName('x'.repeat(52), ' (cópia)', 60)).toBe(`${'x'.repeat(52)} (cópia)`);
  });
});
