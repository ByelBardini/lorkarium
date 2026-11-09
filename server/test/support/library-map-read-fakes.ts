import type { LibraryMapReadDaos } from '../../src/modules/library-maps/library-map-read-policy.service';
import type { LibraryMapReachPo } from '../../src/modules/library-maps/library-maps.dao';
import { ANA_ID } from './auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from './campaigns-fakes';
import { BIA_ID, CAIO_ID, VHARN_ID, campaignMemberPo } from './campaigns-factories';

export const WORLD_MAP_ASSET_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const CREATED_AT = new Date('2026-11-09T12:00:00.000Z');

/** A private map of Vharn over `WORLD_MAP_ASSET_ID`, as `findByAsset` would return it.
 *
 *  Example: `snapshot.maps.rows.push(worldMapPo({ isMain: true }))` */
export function worldMapPo(overrides: Partial<LibraryMapReachPo> = {}): LibraryMapReachPo {
  return {
    id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    campaignId: VHARN_ID,
    folderId: null,
    assetId: WORLD_MAP_ASSET_ID,
    name: 'Mundo',
    visibility: 'private',
    isMain: false,
    hiddenByFolder: false,
    version: 0,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

export class LibraryMapAssetLookupFake implements Pick<LibraryMapReadDaos['maps'], 'findByAsset'> {
  rows: LibraryMapReachPo[] = [];

  async findByAsset(campaignId: string, assetId: string): Promise<LibraryMapReachPo | undefined> {
    return this.rows.find((row) => row.campaignId === campaignId && row.assetId === assetId);
  }
}

/** One read transaction over Vharn: Ana masters it, Bia plays and Caio watches. `snapshots` counts
 *  how many transactions the policy opened.
 *
 *  Example: `new LibraryMapReadPolicy(new LibraryMapReadSnapshotFake().run)` */
export class LibraryMapReadSnapshotFake {
  readonly maps = new LibraryMapAssetLookupFake();
  readonly members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
    campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
    campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'spectator' }),
  ]);
  snapshots = 0;

  readonly run = async <T>(work: (daos: LibraryMapReadDaos) => Promise<T>): Promise<T> => {
    this.snapshots += 1;
    return work(this);
  };
}
