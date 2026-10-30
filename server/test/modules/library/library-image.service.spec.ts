import { describe, expect, it } from 'vitest';
import { LibraryImageService } from '../../../src/modules/library/library-image.service';
import { LibraryImagesHarness } from '../../support/library-images-fakes';
import { libraryImageRow } from '../../support/library-image-factories';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
const requester = { userId: ANA_ID, campaignId: VHARN_ID };
describe('library image writes', () => {
  it('creates privately and publishes only after commit', async () => {
    const h = new LibraryImagesHarness();
    const service = new LibraryImageService(h.deps);
    const image = await service.create(requester, {
      name: 'Retrato',
      assetId: libraryImageRow().asset.id,
    });
    expect(image.visibility).toBe('private');
    expect(h.journal).toEqual(['lock', 'insert', 'commit', 'publish library']);
  });
  it('does not publish on persistence failure', async () => {
    const h = new LibraryImagesHarness();
    h.images.failSave = true;
    await expect(
      new LibraryImageService(h.deps).create(requester, {
        name: 'Retrato',
        assetId: libraryImageRow().asset.id,
      }),
    ).rejects.toThrow('save failed');
    expect(h.journal).toEqual(['lock']);
  });
  it('denies player before any lock or write', async () => {
    const h = new LibraryImagesHarness();
    await expect(
      new LibraryImageService(h.deps).create(
        { ...requester, userId: BIA_ID },
        { name: 'Retrato', assetId: libraryImageRow().asset.id },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.journal).toEqual([]);
  });
  it('clears the current presentation before deletion, then publishes after commit', async () => {
    const h = new LibraryImagesHarness();
    const row = libraryImageRow();
    h.images.rows.push(row);
    await h.presentations.save(
      VHARN_ID,
      { presentationId: 'p1', imageId: row.image.id, nameAtPresentation: 'Retrato' },
      h.deps.clock.now(),
    );
    h.journal.length = 0;
    await new LibraryImageService(h.deps).delete(requester, row.image.id);
    expect(h.journal).toEqual([
      'lock',
      'save presentation',
      'delete',
      'commit',
      'publish presentation',
      'publish library',
    ]);
    expect(h.events[0]).toMatchObject({ version: 2, presentation: null });
  });
});
