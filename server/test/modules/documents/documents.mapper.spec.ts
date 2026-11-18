import { PLAN_LIMITS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { toDocumentDto, toDocumentSummary } from '../../../src/modules/documents/documents.mapper';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import {
  GERAL_TAB_ID,
  SEGREDOS_TAB_ID,
  documentPo,
  documentTabPo,
} from '../../support/documents-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
const GERAL = { ...documentTabPo(), rank: 0 };
const SECRET = {
  ...documentTabPo({ id: SEGREDOS_TAB_ID, name: 'Segredos', position: 1, visibility: 'masters' }),
  rank: 1,
};
const MASTER = new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' });
describe('document mappers', () => {
  it('summary carries the library preview under its own names, not the columns', () => {
    const summary = toDocumentSummary(
      documentPo({ previewSummary: 'Selada.', previewAssetId: GERAL_TAB_ID }),
      [],
      new CampaignAccessBo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    );
    expect(summary.preview).toEqual({ summary: 'Selada.', imageAssetId: GERAL_TAB_ID });
    expect(summary).not.toHaveProperty('previewAssetId');
  });
  it('summary omits body and owners from a public reader while preserving read capabilities', () => {
    const summary = toDocumentSummary(
      documentPo({ visibility: 'public' }),
      [ANA_ID],
      new CampaignAccessBo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    );
    expect(summary).toMatchObject({
      canEdit: false,
      canManage: false,
      updatedAt: '2026-10-29T15:00:00.000Z',
    });
    expect(summary).not.toHaveProperty('content');
    expect(summary).not.toHaveProperty('ownerIds');
  });
  it('master detail includes owners and every tab summary without database-only columns', () => {
    const detail = toDocumentDto(
      documentPo(),
      [BIA_ID],
      MASTER,
      [GERAL, SECRET],
      PLAN_LIMITS.amigo_do_dono,
    );
    expect(detail).toMatchObject({ ownerIds: [BIA_ID], schemaVersion: 2 });
    expect(detail.tabs.map((tab) => tab.id)).toEqual([GERAL_TAB_ID, SEGREDOS_TAB_ID]);
    expect(detail).not.toHaveProperty('campaignId');
    expect(detail).not.toHaveProperty('createdBy');
  });
  it('owner detail lists only the tabs visible to them and carries no tab body', () => {
    const detail = toDocumentDto(
      documentPo(),
      [BIA_ID],
      new CampaignAccessBo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      [SECRET, GERAL],
      PLAN_LIMITS.amigo_do_dono,
    );
    expect(detail.tabs).toEqual([
      {
        id: GERAL_TAB_ID,
        name: 'Geral',
        visibility: 'document',
        version: 0,
        updatedAt: '2026-10-29T15:00:00.000Z',
        planLocked: false,
      },
    ]);
  });
  it('on a free table each tab is planLocked by its rank, not by its position', () => {
    const born = (id: string, position: number, rank: number) => ({
      ...documentTabPo({ id, name: `Aba ${rank + 1}`, position }),
      rank,
    });
    // The 4th born (rank 3) sits first in the strip after a reorder.
    const tabs = [born(SEGREDOS_TAB_ID, 0, 3), born(GERAL_TAB_ID, 1, 2)];

    const detail = toDocumentDto(documentPo(), [], MASTER, tabs, PLAN_LIMITS.free);

    expect(detail.tabs.map(({ id, planLocked }) => [id, planLocked])).toEqual([
      [SEGREDOS_TAB_ID, true],
      [GERAL_TAB_ID, false],
    ]);
  });
});
