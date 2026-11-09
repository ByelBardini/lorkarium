import { describe, expect, it } from 'vitest';
import {
  CampaignAccessBo,
  type CampaignRole,
} from '../../../src/modules/campaigns/campaign-access.bo';
import {
  LibraryMapAccessBo,
  isMapOpenToTable,
  requireFreeMapAsset,
  requireMapDeletable,
} from '../../../src/modules/library-maps/library-map-access.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';

const MUNDO_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const ART_ID = '2a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const PRIVATE_MAP = {
  id: MUNDO_ID,
  visibility: 'private',
  isMain: false,
  hiddenByFolder: false,
} as const;
const PUBLIC_MAP = {
  id: MUNDO_ID,
  visibility: 'public',
  isMain: false,
  hiddenByFolder: false,
} as const;
const PRIVATE_MAIN_MAP = {
  id: MUNDO_ID,
  visibility: 'private',
  isMain: true,
  hiddenByFolder: false,
} as const;

function accessOf(userId: string, role: CampaignRole | null): LibraryMapAccessBo {
  return new LibraryMapAccessBo(new CampaignAccessBo({ campaignId: VHARN_ID, userId, role }));
}

describe('a map inside a private folder', () => {
  const hidden = { ...PUBLIC_MAP, hiddenByFolder: true };

  it('is closed to the table even while public', () => {
    expect(isMapOpenToTable(hidden)).toBe(false);
  });

  it('stays open while it is the main one', () => {
    expect(isMapOpenToTable({ ...hidden, isMain: true })).toBe(true);
  });
});

describe('LibraryMapAccessBo.canSee', () => {
  it('Ana, the master, sees a private map that is not the main one', () => {
    expect(accessOf(ANA_ID, 'master').canSee(PRIVATE_MAP)).toBe(true);
  });

  it('Bia sees a public map', () => {
    expect(accessOf(BIA_ID, 'player').canSee(PUBLIC_MAP)).toBe(true);
  });

  it('Bia sees a private map while it is the main one', () => {
    expect(accessOf(BIA_ID, 'player').canSee(PRIVATE_MAIN_MAP)).toBe(true);
  });

  it('Bia does not see a private map that is not the main one', () => {
    expect(accessOf(BIA_ID, 'player').canSee(PRIVATE_MAP)).toBe(false);
  });

  it('a spectator reads like a player', () => {
    const spectator = accessOf(BIA_ID, 'spectator');
    expect(spectator.canSee(PRIVATE_MAP)).toBe(false);
    expect(spectator.canSee(PRIVATE_MAIN_MAP)).toBe(true);
  });

  it('someone who is not a member gets CAMPAIGN_NOT_FOUND, even on a public map', () => {
    const reach = () => accessOf(BIA_ID, null).canSee(PUBLIC_MAP);
    expect(reach).toThrow(expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }));
  });
});

describe('LibraryMapAccessBo.requireSee', () => {
  it('lets through who can see the map', () => {
    expect(() => accessOf(BIA_ID, 'player').requireSee(PUBLIC_MAP)).not.toThrow();
  });

  it('answers a hidden map as LIBRARY_MAP_NOT_FOUND, citing the map, the table and who asked', () => {
    const reach = () => accessOf(BIA_ID, 'player').requireSee(PRIVATE_MAP);
    expect(reach).toThrow(
      expect.objectContaining({
        code: 'LIBRARY_MAP_NOT_FOUND',
        message: expect.stringMatching(new RegExp(`${VHARN_ID}.*${MUNDO_ID}.*${BIA_ID}`)),
      }),
    );
  });
});

describe('requireMapDeletable', () => {
  it('lets a map that is not the main one go', () => {
    expect(() => requireMapDeletable(PRIVATE_MAP)).not.toThrow();
  });

  it('refuses the main map with MAP_IS_MAIN, citing it', () => {
    const remove = () => requireMapDeletable(PRIVATE_MAIN_MAP);
    expect(remove).toThrow(
      expect.objectContaining({
        code: 'MAP_IS_MAIN',
        message: expect.stringContaining(MUNDO_ID),
      }),
    );
  });
});

describe('requireFreeMapAsset', () => {
  it('accepts an image sent for a map that no map uses yet', () => {
    expect(() => requireFreeMapAsset(ART_ID, { purpose: 'library_map' }, false)).not.toThrow();
  });

  it('refuses an image of another purpose as ASSET_NOT_FOUND', () => {
    const use = () => requireFreeMapAsset(ART_ID, { purpose: 'library_image' }, false);
    expect(use).toThrow(expect.objectContaining({ code: 'ASSET_NOT_FOUND' }));
  });

  it('refuses an image that is not of the table as ASSET_NOT_FOUND', () => {
    const use = () => requireFreeMapAsset(ART_ID, undefined, false);
    expect(use).toThrow(expect.objectContaining({ code: 'ASSET_NOT_FOUND' }));
  });

  it('refuses an image another map already uses as ASSET_NOT_FOUND', () => {
    const use = () => requireFreeMapAsset(ART_ID, { purpose: 'library_map' }, true);
    expect(use).toThrow(
      expect.objectContaining({
        code: 'ASSET_NOT_FOUND',
        message: expect.stringContaining(ART_ID),
      }),
    );
  });
});

describe('isMapOpenToTable', () => {
  it('is true for a public map and for the main one even while private', () => {
    expect(isMapOpenToTable(PUBLIC_MAP)).toBe(true);
    expect(isMapOpenToTable(PRIVATE_MAIN_MAP)).toBe(true);
  });

  it('is false for a private map that is not the main one', () => {
    expect(isMapOpenToTable(PRIVATE_MAP)).toBe(false);
  });
});

describe('LibraryMapAccessBo.canSeeRegion', () => {
  const VISIBLE = { hidden: false };
  const HIDDEN = { hidden: true };

  it('Ana sees a hidden region of a private map', () => {
    expect(accessOf(ANA_ID, 'master').canSeeRegion(PRIVATE_MAP, HIDDEN)).toBe(true);
  });

  it('Bia sees a visible region of a public map', () => {
    expect(accessOf(BIA_ID, 'player').canSeeRegion(PUBLIC_MAP, VISIBLE)).toBe(true);
  });

  it('Bia does not see a hidden region, even of a public map', () => {
    expect(accessOf(BIA_ID, 'player').canSeeRegion(PUBLIC_MAP, HIDDEN)).toBe(false);
  });

  it('Bia does not see a visible region of a map she cannot see', () => {
    expect(accessOf(BIA_ID, 'player').canSeeRegion(PRIVATE_MAP, VISIBLE)).toBe(false);
  });
});
