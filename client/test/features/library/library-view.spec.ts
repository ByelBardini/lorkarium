import { describe, expect, it } from 'vitest';
import { NO_FOLDER, folderForNew, sceneIdOf, sceneKey } from '@/features/library/library-view';
import { ATO_1, CATACUMBAS, OSSUARIO, masterLibrary } from '../../support/library-fixtures';
import { VHARN_SCENE } from '../../support/table-session-fixtures';

describe('sceneKey and sceneIdOf', () => {
  it('give back the grid of its tree item', () => {
    expect(sceneIdOf(sceneKey(OSSUARIO.id))).toBe(OSSUARIO.id);
  });

  it('a folder, "Sem pasta" or nothing is no grid', () => {
    expect(sceneIdOf(ATO_1.id)).toBeNull();
    expect(sceneIdOf(NO_FOLDER)).toBeNull();
    expect(sceneIdOf(null)).toBeNull();
  });
});

describe('folderForNew', () => {
  it('creates inside the folder picked', () => {
    expect(folderForNew(masterLibrary(), CATACUMBAS.id)).toBe(CATACUMBAS.id);
  });

  it('creates in the folder of the grid picked', () => {
    expect(folderForNew(masterLibrary(), sceneKey(OSSUARIO.id))).toBe(CATACUMBAS.id);
    expect(folderForNew(masterLibrary(), sceneKey(VHARN_SCENE.id))).toBeNull();
  });

  it('creates at the root with nothing, "Sem pasta" or a folder that is gone picked', () => {
    expect(folderForNew(masterLibrary(), null)).toBeNull();
    expect(folderForNew(masterLibrary(), NO_FOLDER)).toBeNull();
    expect(folderForNew(masterLibrary(), 'f0f0f0f0-0000-4000-8000-000000000000')).toBeNull();
  });
});
