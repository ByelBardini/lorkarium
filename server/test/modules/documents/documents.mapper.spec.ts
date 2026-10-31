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
const SECRET = documentTabPo({
  id: SEGREDOS_TAB_ID,
  name: 'Segredos',
  position: 1,
  visibility: 'masters',
});
describe('document mappers', () => {
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
      new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      [documentTabPo(), SECRET],
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
      [SECRET, documentTabPo()],
    );
    expect(detail.tabs).toEqual([
      {
        id: GERAL_TAB_ID,
        name: 'Geral',
        visibility: 'document',
        version: 0,
        updatedAt: '2026-10-29T15:00:00.000Z',
      },
    ]);
  });
});
