import { describe, expect, it } from 'vitest';
import {
  CampaignAccessBo,
  type CampaignRole,
} from '../../../src/modules/campaigns/campaign-access.bo';
import {
  MapRegionProjectionBo,
  mapLinkTargetIdsOf,
  type MapLinkTargets,
  type ProjectedMapLink,
} from '../../../src/modules/library-maps/map-region-projection.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { mapRegionPo, REINO_REGION_ID } from '../../support/library-maps-factories';

const TARGET_ID = '9f2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const OTHER_ID = '9e2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

const NO_TARGETS: MapLinkTargets = {
  groupSceneId: null,
  documents: new Map(),
  scenes: new Map(),
  maps: new Map(),
  images: new Map(),
};

const documentAt = (visibility: 'public' | 'private', ownerIds: readonly string[] = []) => ({
  ...NO_TARGETS,
  documents: new Map([
    [
      TARGET_ID,
      { id: TARGET_ID, name: 'Diário', visibility, ownerIds, version: 0, hiddenByFolder: false },
    ],
  ]),
});
const sceneAt = (visibility: 'public' | 'private', groupSceneId: string | null = null) => ({
  ...NO_TARGETS,
  groupSceneId,
  scenes: new Map([
    [TARGET_ID, { id: TARGET_ID, name: 'Salão', visibility, hiddenByFolder: false }],
  ]),
});
const mapAt = (visibility: 'public' | 'private', isMain = false) => ({
  ...NO_TARGETS,
  maps: new Map([[TARGET_ID, { name: 'Masmorra', visibility, isMain, hiddenByFolder: false }]]),
});
const imageAt = (visibility: 'public' | 'private', isPresented = false) => ({
  ...NO_TARGETS,
  images: new Map([
    [TARGET_ID, { name: 'Brasão', visibility, isPresented, hiddenByFolder: false }],
  ]),
});

const documentRegion = mapRegionPo({ linkKind: 'document', targetDocumentId: TARGET_ID });
const sceneRegion = mapRegionPo({ linkKind: 'scene', targetSceneId: TARGET_ID });
const mapRegion = mapRegionPo({ linkKind: 'map', targetMapId: TARGET_ID });
const imageRegion = mapRegionPo({ linkKind: 'image', targetImageId: TARGET_ID });

function accessOf(userId: string, role: CampaignRole | null): CampaignAccessBo {
  return new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
}

function linkFor(
  role: CampaignRole,
  targets: MapLinkTargets,
  region: Parameters<MapRegionProjectionBo['project']>[0][number],
): ProjectedMapLink | undefined {
  const userId = role === 'master' ? ANA_ID : BIA_ID;
  return new MapRegionProjectionBo(accessOf(userId, role), targets).project([region])[0]?.link;
}

const LOCKED = { state: 'locked' };
const open = (kind: string, name: string) => ({ state: 'open', kind, id: TARGET_ID, name });

describe('MapRegionProjectionBo: hidden regions', () => {
  const hidden = mapRegionPo({ hidden: true });

  it('Ana, the master, gets a hidden region, marked as hidden', () => {
    const bo = new MapRegionProjectionBo(accessOf(ANA_ID, 'master'), NO_TARGETS);
    expect(bo.project([hidden])).toEqual([{ region: hidden, link: null }]);
  });

  it.each(['player', 'spectator'] as const)('a %s does not get a hidden region', (role) => {
    const bo = new MapRegionProjectionBo(accessOf(BIA_ID, role), NO_TARGETS);
    expect(bo.project([hidden])).toEqual([]);
  });

  it('keeps the order of the visible ones around a hidden one', () => {
    const first = mapRegionPo({ id: OTHER_ID });
    const last = mapRegionPo();
    const bo = new MapRegionProjectionBo(accessOf(BIA_ID, 'player'), NO_TARGETS);
    expect(bo.project([first, hidden, last]).map(({ region }) => region.id)).toEqual([
      OTHER_ID,
      REINO_REGION_ID,
    ]);
  });

  it('refuses someone who is not at the table as CAMPAIGN_NOT_FOUND', () => {
    const bo = new MapRegionProjectionBo(accessOf(BIA_ID, null), NO_TARGETS);
    expect(() => bo.project([mapRegionPo()])).toThrowError(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    );
  });
});

describe('MapRegionProjectionBo: a link without an item', () => {
  it('no link is null for everybody', () => {
    expect(linkFor('master', NO_TARGETS, mapRegionPo())).toBeNull();
    expect(linkFor('player', NO_TARGETS, mapRegionPo())).toBeNull();
  });

  it('an item that was deleted is removed for the master, with what it was', () => {
    const region = mapRegionPo({ linkKind: 'scene' });
    expect(linkFor('master', NO_TARGETS, region)).toStrictEqual({
      state: 'removed',
      kind: 'scene',
    });
  });

  it.each(['player', 'spectator'] as const)('an item that was deleted is null for a %s', (role) => {
    expect(linkFor(role, NO_TARGETS, mapRegionPo({ linkKind: 'scene' }))).toBeNull();
  });

  it('a target that was not found reveals nothing to a player', () => {
    expect(linkFor('player', NO_TARGETS, documentRegion)).toStrictEqual(LOCKED);
  });
});

describe('MapRegionProjectionBo: a document', () => {
  it('a public one opens for a player, with its name', () => {
    expect(linkFor('player', documentAt('public'), documentRegion)).toStrictEqual(
      open('document', 'Diário'),
    );
  });

  it('a private one is locked for a player, with no id, name or kind', () => {
    expect(linkFor('player', documentAt('private'), documentRegion)).toStrictEqual(LOCKED);
  });

  it('a private one opens for the player who owns it', () => {
    expect(linkFor('player', documentAt('private', [BIA_ID]), documentRegion)).toStrictEqual(
      open('document', 'Diário'),
    );
  });

  it('ownership gives nothing to a spectator', () => {
    expect(linkFor('spectator', documentAt('private', [BIA_ID]), documentRegion)).toStrictEqual(
      LOCKED,
    );
  });

  it('a private one opens for the master', () => {
    expect(linkFor('master', documentAt('private'), documentRegion)).toStrictEqual(
      open('document', 'Diário'),
    );
  });
});

describe('MapRegionProjectionBo: a grid', () => {
  it('a public one opens for a player', () => {
    expect(linkFor('player', sceneAt('public'), sceneRegion)).toStrictEqual(open('scene', 'Salão'));
  });

  it('the group grid opens for a player even while it is private', () => {
    expect(linkFor('player', sceneAt('private', TARGET_ID), sceneRegion)).toStrictEqual(
      open('scene', 'Salão'),
    );
  });

  it('another private grid is locked for a player', () => {
    expect(linkFor('player', sceneAt('private', OTHER_ID), sceneRegion)).toStrictEqual(LOCKED);
  });

  it('a private one opens for the master', () => {
    expect(linkFor('master', sceneAt('private'), sceneRegion)).toStrictEqual(
      open('scene', 'Salão'),
    );
  });
});

describe('MapRegionProjectionBo: another map', () => {
  it('a public one opens for a player', () => {
    expect(linkFor('player', mapAt('public'), mapRegion)).toStrictEqual(open('map', 'Masmorra'));
  });

  it('the main one opens for a player even while it is private', () => {
    expect(linkFor('player', mapAt('private', true), mapRegion)).toStrictEqual(
      open('map', 'Masmorra'),
    );
  });

  it('another private one is locked for a player', () => {
    expect(linkFor('player', mapAt('private'), mapRegion)).toStrictEqual(LOCKED);
  });

  it('a private one opens for the master', () => {
    expect(linkFor('master', mapAt('private'), mapRegion)).toStrictEqual(open('map', 'Masmorra'));
  });
});

describe('MapRegionProjectionBo: an image', () => {
  it('a public one opens for a player', () => {
    expect(linkFor('player', imageAt('public'), imageRegion)).toStrictEqual(
      open('image', 'Brasão'),
    );
  });

  it('the one being presented opens for a player even while it is private', () => {
    expect(linkFor('player', imageAt('private', true), imageRegion)).toStrictEqual(
      open('image', 'Brasão'),
    );
  });

  it('another private one is locked for a player', () => {
    expect(linkFor('player', imageAt('private'), imageRegion)).toStrictEqual(LOCKED);
  });

  it('a private one opens for the master', () => {
    expect(linkFor('master', imageAt('private'), imageRegion)).toStrictEqual(
      open('image', 'Brasão'),
    );
  });
});

describe('mapLinkTargetIdsOf', () => {
  it('groups the targets by type, each id once', () => {
    const ids = mapLinkTargetIdsOf([documentRegion, documentRegion, sceneRegion, mapRegion]);
    expect(ids).toEqual({
      documents: [TARGET_ID],
      scenes: [TARGET_ID],
      maps: [TARGET_ID],
      images: [],
    });
  });

  it('skips a region without a link and a deleted target', () => {
    const ids = mapLinkTargetIdsOf([mapRegionPo(), mapRegionPo({ linkKind: 'image' })]);
    expect(ids).toEqual({ documents: [], scenes: [], maps: [], images: [] });
  });
});
