import { expect, it } from 'vitest';
import { editLibraryImages } from '../../../src/modules/library/library-image-transaction';
import { LibraryImagesHarness } from '../../support/library-images-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { VHARN_ID } from '../../support/campaigns-factories';
it('locks before invoking work and commits its result', async () => {
  const h = new LibraryImagesHarness();
  const result = await editLibraryImages(
    h.deps,
    { userId: ANA_ID, campaignId: VHARN_ID },
    async () => {
      h.journal.push('work');
      return 'saved';
    },
  );
  expect(result).toBe('saved');
  expect(h.journal).toEqual(['lock', 'work', 'commit']);
});
