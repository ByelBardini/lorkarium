import type { UserPlan } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import type {
  LibraryMapListedRow,
  LibraryMapsDao,
} from '../../../src/modules/library-maps/library-maps.dao';
import { LibraryImageService } from '../../../src/modules/library/library-image.service';
import type { SheetTemplatesDao } from '../../../src/modules/sheets/sheet-templates.dao';
import type { SheetTemplateSummaryPo } from '../../../src/modules/sheets/sheet-templates.po';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID, campaignPo } from '../../support/campaigns-factories';
import { OwnerPlanCampaignsDaoFake, LibraryScenesDaoFake } from '../../support/library-fakes';
import { librarySceneRow } from '../../support/library-factories';
import { LibraryImagesHarness } from '../../support/library-images-fakes';
import { libraryMapRow } from '../../support/library-maps-factories';
import { planAccount } from '../../support/plan-account-fakes';
import { sheetTemplatePo } from '../../support/sheet-templates-fakes';

const ids = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, n) => `${prefix}-0000-4000-8000-00000000000${n + 1}`);
const GRIDS = ids('0d0d0d0d', 4);
const MAPS = ids('5b5b5b5b', 4);
const TEMPLATES = ids('6c6c6c6c', 2);

/** The maps of the table as the aggregate reads them, oldest first. */
class ListedMapsFake implements Pick<LibraryMapsDao, 'listOfCampaign'> {
  constructor(private readonly rows: LibraryMapListedRow[]) {}

  async listOfCampaign(campaignId: string): Promise<LibraryMapListedRow[]> {
    return this.rows.filter(({ map }) => map.campaignId === campaignId);
  }
}

/** The templates of the table as the aggregate reads them, oldest first. */
class ListedTemplatesFake implements Pick<SheetTemplatesDao, 'listOfCampaign'> {
  constructor(private readonly rows: SheetTemplateSummaryPo[]) {}

  async listOfCampaign(campaignId: string): Promise<SheetTemplateSummaryPo[]> {
    return this.rows.filter((row) => row.campaignId === campaignId);
  }
}

// A table whose owner is now on `plan`: 4 grids, 4 maps (public from the 3rd on) and 2 templates.
function aggregateOf(plan: UserPlan): LibraryImageService {
  const h = new LibraryImagesHarness();
  const campaigns = new OwnerPlanCampaignsDaoFake(h.journal, [
    campaignPo({ id: VHARN_ID, activeSceneId: GRIDS[0]! }),
  ]);
  campaigns.owner = planAccount({ plan });
  const scenes = new LibraryScenesDaoFake(
    h.journal,
    GRIDS.map((id) => librarySceneRow({ id, visibility: 'public' })),
  );
  const maps = new ListedMapsFake(
    MAPS.map((id, n) => libraryMapRow({ id, visibility: n >= 2 ? 'public' : 'private' })),
  );
  const sheetTemplates = new ListedTemplatesFake(TEMPLATES.map((id) => sheetTemplatePo({ id })));
  const daos = { ...h.daos, campaigns, scenes, maps, sheetTemplates };
  return new LibraryImageService({ ...h.deps, read: daos, snapshot: (work) => work(daos) });
}

describe('the library aggregate of a table fallen to free', () => {
  it('marks planLocked on the 4th grid, on every map and on the 2nd template', async () => {
    const library = await aggregateOf('free').list({ userId: ANA_ID, campaignId: VHARN_ID });

    expect(library.scenes.map(({ planLocked }) => planLocked)).toEqual([false, false, false, true]);
    expect(library.maps.map(({ planLocked }) => planLocked)).toEqual([true, true, true, true]);
    expect(library.sheetTemplates?.map(({ planLocked }) => planLocked)).toEqual([false, true]);
  });

  it("at a narrador table (3 maps) a player's maps keep their rank among all of the table's", async () => {
    const library = await aggregateOf('narrador').list({ userId: BIA_ID, campaignId: VHARN_ID });

    expect(library.maps.map(({ id, planLocked }) => [id, planLocked])).toEqual([
      [MAPS[2], false],
      [MAPS[3], true],
    ]);
  });
});
