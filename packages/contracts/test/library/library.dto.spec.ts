import { describe, expect, it } from 'vitest';
import {
  createLibrarySceneRequestDto,
  createSceneFolderRequestDto,
  sceneActivatedDto,
  sceneClosedDto,
  updateLibrarySceneRequestDto,
  updateSceneFolderRequestDto,
} from '../../src/library/library.dto';

const ATO_1_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('createLibrarySceneRequestDto', () => {
  it('an empty body is accepted (the server names the grid and puts it at the root)', () => {
    expect(createLibrarySceneRequestDto.parse({})).toEqual({});
  });

  it('the name is trimmed', () => {
    expect(createLibrarySceneRequestDto.parse({ name: '  Ossuário ' })).toEqual({
      name: 'Ossuário',
    });
  });

  it.each(['', '   ', 'x'.repeat(61)])('the name %j is refused', (name) => {
    expect(createLibrarySceneRequestDto.safeParse({ name }).success).toBe(false);
  });

  it('a name of 60 characters is accepted', () => {
    expect(createLibrarySceneRequestDto.safeParse({ name: 'x'.repeat(60) }).success).toBe(true);
  });

  it('a campaignId in the body is refused (the table comes from the URL)', () => {
    const forged = { folderId: ATO_1_ID, campaignId: ATO_1_ID };
    expect(createLibrarySceneRequestDto.safeParse(forged).success).toBe(false);
  });
});

describe('updateLibrarySceneRequestDto', () => {
  it('the name is trimmed', () => {
    expect(updateLibrarySceneRequestDto.parse({ name: '  Torre ' })).toEqual({ name: 'Torre' });
  });

  it('folderId null takes the grid to the root and stays as a key', () => {
    expect(updateLibrarySceneRequestDto.parse({ folderId: null })).toEqual({ folderId: null });
  });

  it('an empty change is refused citing the keys it expects', () => {
    const result = updateLibrarySceneRequestDto.safeParse({});
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'changes is empty; expected at least one of name, folderId, visibility',
    ]);
  });

  it('a visibility outside private and public is refused', () => {
    expect(updateLibrarySceneRequestDto.safeParse({ visibility: 'hidden' }).success).toBe(false);
  });
});

describe('createSceneFolderRequestDto', () => {
  it('the name is trimmed and no parent means the root', () => {
    expect(createSceneFolderRequestDto.parse({ name: ' Ato 1 ' })).toEqual({ name: 'Ato 1' });
  });

  it.each(['', '  ', 'x'.repeat(41)])('the name %j is refused', (name) => {
    expect(createSceneFolderRequestDto.safeParse({ name }).success).toBe(false);
  });

  it('a name of 40 characters is accepted', () => {
    expect(createSceneFolderRequestDto.safeParse({ name: 'x'.repeat(40) }).success).toBe(true);
  });
});

describe('updateSceneFolderRequestDto', () => {
  it('parentId null moves the folder to the root and stays as a key', () => {
    expect(updateSceneFolderRequestDto.parse({ parentId: null })).toEqual({ parentId: null });
  });

  it('an empty change is refused citing the keys it expects', () => {
    const result = updateSceneFolderRequestDto.safeParse({});
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'changes is empty; expected at least one of name, parentId',
    ]);
  });

  it('a parentId that is not a uuid is refused', () => {
    expect(updateSceneFolderRequestDto.safeParse({ parentId: ATO_1_ID.slice(1) }).success).toBe(
      false,
    );
  });
});

const VHARN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const ESTRADA_ID = '9c8b7a6d-5e4f-4a3b-9c1d-0e9f8a7b6c5d';
const SALAO_ID = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
const AT = '2026-10-23T12:00:00.000Z';

describe('sceneActivatedDto', () => {
  it('a scene:activated names the new group grid and the one before it', () => {
    const event = { campaignId: VHARN_ID, sceneId: ESTRADA_ID, previousSceneId: SALAO_ID, at: AT };
    expect(sceneActivatedDto.parse(event)).toEqual(event);
  });

  it('a table that had no group grid sends previousSceneId null', () => {
    const event = { campaignId: VHARN_ID, sceneId: ESTRADA_ID, previousSceneId: null, at: AT };
    expect(sceneActivatedDto.parse(event)).toEqual(event);
  });

  it('a scene:activated without previousSceneId is refused on it', () => {
    const result = sceneActivatedDto.safeParse({
      campaignId: VHARN_ID,
      sceneId: ESTRADA_ID,
      at: AT,
    });
    expect(result.error?.issues[0]?.path).toEqual(['previousSceneId']);
  });
});

describe('sceneClosedDto', () => {
  it.each(['private', 'deleted'])('a scene:closed with reason %s is accepted', (reason) => {
    const event = { campaignId: VHARN_ID, sceneId: SALAO_ID, reason, at: AT };
    expect(sceneClosedDto.parse(event)).toEqual(event);
  });

  it('an unknown reason is refused on reason', () => {
    const event = { campaignId: VHARN_ID, sceneId: SALAO_ID, reason: 'moved', at: AT };
    expect(sceneClosedDto.safeParse(event).error?.issues[0]?.path).toEqual(['reason']);
  });
});
