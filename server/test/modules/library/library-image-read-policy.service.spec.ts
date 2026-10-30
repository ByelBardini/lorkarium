import { beforeEach, describe, expect, it } from 'vitest';
import {
  LibraryImageReadPolicy,
  type LibraryImageReadDaos,
} from '../../../src/modules/library/library-image-read-policy.service';
import type { LibraryImageRow } from '../../../src/modules/library/library-images.dao';
import type { ImagePresentationPo } from '../../../src/modules/library/image-presentations.po';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { imagePresentationPo, libraryImageRow } from '../../support/library-image-factories';

type ImageReadDao = LibraryImageReadDaos['images'];
type PresentationReadDao = LibraryImageReadDaos['presentations'];

class ImageReadDaoFake implements ImageReadDao {
  rows: LibraryImageRow[] = [];
  async listOfCampaign(campaignId: string): Promise<LibraryImageRow[]> {
    return this.rows.filter((row) => row.image.campaignId === campaignId);
  }
}

class PresentationReadDaoFake implements PresentationReadDao {
  current: ImagePresentationPo | undefined;
  async findOfCampaign(campaignId: string): Promise<ImagePresentationPo | undefined> {
    return this.current?.campaignId === campaignId ? this.current : undefined;
  }
}

class LibraryReadSnapshotFake {
  readonly images = new ImageReadDaoFake();
  readonly presentations = new PresentationReadDaoFake();
  readonly members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
    campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
    campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'spectator' }),
  ]);
  snapshots = 0;
  readonly run = async <T>(work: (daos: LibraryImageReadDaos) => Promise<T>): Promise<T> => {
    this.snapshots += 1;
    return work(this);
  };
}

describe('LibraryImageReadPolicy', () => {
  let snapshot: LibraryReadSnapshotFake;
  let policy: LibraryImageReadPolicy;
  beforeEach(() => {
    snapshot = new LibraryReadSnapshotFake();
    policy = new LibraryImageReadPolicy(snapshot.run);
  });

  it('a master reads an orphan dedicated file while a player and spectator cannot', async () => {
    expect(await policy.canRead(ANA_ID, VHARN_ID, libraryImageRow().asset.id)).toBe(true);
    expect(await policy.canRead(BIA_ID, VHARN_ID, libraryImageRow().asset.id)).toBe(false);
    expect(await policy.canRead(CAIO_ID, VHARN_ID, libraryImageRow().asset.id)).toBe(false);
  });

  it.each([BIA_ID, CAIO_ID])(
    'reader %s can read a public image without a presentation',
    async (userId) => {
      const row = libraryImageRow();
      snapshot.images.rows.push({ ...row, image: { ...row.image, visibility: 'public' } });
      expect(await policy.canRead(userId, VHARN_ID, row.asset.id)).toBe(true);
      expect(snapshot.snapshots).toBe(1);
    },
  );

  it('a private image remains unreadable until it is the current presentation', async () => {
    snapshot.images.rows.push(libraryImageRow());
    expect(await policy.canRead(BIA_ID, VHARN_ID, libraryImageRow().asset.id)).toBe(false);
    snapshot.presentations.current = imagePresentationPo();
    expect(await policy.canRead(BIA_ID, VHARN_ID, libraryImageRow().asset.id)).toBe(true);
    expect(await policy.canRead(CAIO_ID, VHARN_ID, libraryImageRow().asset.id)).toBe(true);
  });

  it('replacing a private presentation revokes future reads of its old file', async () => {
    snapshot.images.rows.push(libraryImageRow());
    snapshot.presentations.current = imagePresentationPo();
    expect(await policy.canRead(BIA_ID, VHARN_ID, libraryImageRow().asset.id)).toBe(true);
    snapshot.presentations.current = imagePresentationPo({ imageId: 'another-image' });
    expect(await policy.canRead(BIA_ID, VHARN_ID, libraryImageRow().asset.id)).toBe(false);
  });

  it('a public image from another campaign never authorizes this campaigns file', async () => {
    const row = libraryImageRow();
    snapshot.images.rows.push({
      ...row,
      image: { ...row.image, campaignId: QUELM_ID, visibility: 'public' },
    });
    snapshot.presentations.current = imagePresentationPo({ campaignId: QUELM_ID });
    expect(await policy.canRead(BIA_ID, VHARN_ID, row.asset.id)).toBe(false);
  });

  it('a reader outside the requested campaign is refused before metadata is returned', async () => {
    await expect(
      policy.canRead(BIA_ID, QUELM_ID, libraryImageRow().asset.id),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });
});
