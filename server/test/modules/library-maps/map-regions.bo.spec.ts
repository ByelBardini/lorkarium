import { describe, expect, it } from 'vitest';
import {
  linkColumnsOf,
  requireLinkNotSelf,
  requireRegionRoom,
  requireRegionShowable,
  validRegionGeometry,
} from '../../../src/modules/library-maps/map-regions.bo';
import {
  CITY_GEOMETRY,
  KINGDOM_GEOMETRY,
  MUNDO_MAP_ID,
  REINO_REGION_ID,
} from '../../support/library-maps-factories';

const OTHER_MAP_ID = '9f2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const NO_LINK = {
  linkKind: null,
  targetDocumentId: null,
  targetSceneId: null,
  targetMapId: null,
  targetImageId: null,
};

describe('requireRegionRoom', () => {
  it('lets the 300th region in', () => {
    expect(() => requireRegionRoom(MUNDO_MAP_ID, 299)).not.toThrow();
  });

  it('refuses the 301st with MAP_REGIONS_FULL, citing the map and the limit', () => {
    expect(() => requireRegionRoom(MUNDO_MAP_ID, 300)).toThrowError(
      expect.objectContaining({
        code: 'MAP_REGIONS_FULL',
        message: expect.stringMatching(new RegExp(`${MUNDO_MAP_ID}.*300.*300`)),
      }),
    );
  });
});

describe('requireLinkNotSelf', () => {
  it('refuses a link to the map the region is on', () => {
    expect(() => requireLinkNotSelf(MUNDO_MAP_ID, { kind: 'map', id: MUNDO_MAP_ID })).toThrowError(
      expect.objectContaining({ code: 'MAP_LINK_SELF' }),
    );
  });

  it('lets a link to another map through, a cycle being fine', () => {
    expect(() => requireLinkNotSelf(MUNDO_MAP_ID, { kind: 'map', id: OTHER_MAP_ID })).not.toThrow();
  });

  it('only compares maps', () => {
    expect(() =>
      requireLinkNotSelf(MUNDO_MAP_ID, { kind: 'document', id: MUNDO_MAP_ID }),
    ).not.toThrow();
  });
});

describe('validRegionGeometry', () => {
  it('hands a valid polygon and a valid pin back', () => {
    expect(validRegionGeometry(KINGDOM_GEOMETRY)).toEqual(KINGDOM_GEOMETRY);
    expect(validRegionGeometry(CITY_GEOMETRY)).toEqual(CITY_GEOMETRY);
  });

  it('refuses three points on one line with MAP_REGION_GEOMETRY_INVALID, citing the area', () => {
    const line = {
      shape: 'polygon',
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.3 },
      ],
    } as const;
    expect(() => validRegionGeometry({ ...line, points: [...line.points] })).toThrowError(
      expect.objectContaining({
        code: 'MAP_REGION_GEOMETRY_INVALID',
        message: expect.stringContaining('area'),
      }),
    );
  });

  it('lets an error that is not about the geometry go through untouched', () => {
    const broken = {
      get shape(): 'pin' {
        throw new Error('boom');
      },
      point: { x: 0, y: 0 },
    };
    expect(() => validRegionGeometry(broken)).toThrowError('boom');
  });
});

describe('linkColumnsOf', () => {
  it('null clears the kind and every target', () => {
    expect(linkColumnsOf(null)).toEqual(NO_LINK);
  });

  it.each([
    ['document', 'targetDocumentId'],
    ['scene', 'targetSceneId'],
    ['map', 'targetMapId'],
    ['image', 'targetImageId'],
  ] as const)('a %s fills its own target and clears the other three', (kind, column) => {
    expect(linkColumnsOf({ kind, id: OTHER_MAP_ID })).toEqual({
      ...NO_LINK,
      linkKind: kind,
      [column]: OTHER_MAP_ID,
    });
  });
});

describe('requireRegionShowable', () => {
  const visible = { id: REINO_REGION_ID, hidden: false };
  const publicMap = {
    id: MUNDO_MAP_ID,
    visibility: 'public',
    isMain: false,
    hiddenByFolder: false,
  } as const;
  const privateMap = {
    id: MUNDO_MAP_ID,
    visibility: 'private',
    isMain: false,
    hiddenByFolder: false,
  } as const;

  it('lets a visible region of a public map through', () => {
    expect(() => requireRegionShowable(publicMap, visible)).not.toThrow();
  });

  it('lets a visible region of a private main map through', () => {
    expect(() => requireRegionShowable({ ...privateMap, isMain: true }, visible)).not.toThrow();
  });

  it('refuses a hidden region with MAP_REGION_NOT_SHOWABLE', () => {
    expect(() => requireRegionShowable(publicMap, { ...visible, hidden: true })).toThrowError(
      expect.objectContaining({ code: 'MAP_REGION_NOT_SHOWABLE' }),
    );
  });

  it('refuses a private map that is not the main one', () => {
    expect(() => requireRegionShowable(privateMap, visible)).toThrowError(
      expect.objectContaining({ code: 'MAP_REGION_NOT_SHOWABLE' }),
    );
  });
});
