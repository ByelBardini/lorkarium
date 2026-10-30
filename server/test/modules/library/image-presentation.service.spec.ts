import { describe, expect, it } from 'vitest';
import { ImagePresentationService } from '../../../src/modules/library/image-presentation.service';
import { LibraryImagesHarness } from '../../support/library-images-fakes';
import { libraryImageRow } from '../../support/library-image-factories';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID, QUELM_ID } from '../../support/campaigns-factories';
const requester = { userId: ANA_ID, campaignId: VHARN_ID };
describe('image presentation commits', () => {
  it('publishes a fresh id only after persistence, without changing visibility', async () => {
    const h = new LibraryImagesHarness();
    const row = libraryImageRow();
    h.images.rows.push(row);
    const service = new ImagePresentationService(h.deps);
    const first = await service.present(requester, row.image.id);
    expect(h.journal).toEqual(['lock', 'save presentation', 'commit', 'publish presentation']);
    const second = await service.present(requester, row.image.id);
    expect(second.version).toBe(first.version + 1);
    expect(second.presentation?.id).not.toBe(first.presentation?.id);
    expect(row.image.visibility).toBe('private');
  });
  it('never publishes a failed persistence', async () => {
    const h = new LibraryImagesHarness();
    h.images.rows.push(libraryImageRow());
    h.presentations.failSave = true;
    await expect(
      new ImagePresentationService(h.deps).present(requester, libraryImageRow().image.id),
    ).rejects.toThrow('save presentation failed');
    expect(h.journal).toEqual(['lock']);
    expect(h.events).toEqual([]);
  });
  it('refuses players and campaign mismatches without publishing', async () => {
    const h = new LibraryImagesHarness();
    h.images.rows.push(libraryImageRow());
    const service = new ImagePresentationService(h.deps);
    await expect(
      service.present({ ...requester, userId: BIA_ID }, libraryImageRow().image.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.present({ ...requester, campaignId: QUELM_ID }, libraryImageRow().image.id),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
    expect(h.journal).toEqual([]);
  });
});
