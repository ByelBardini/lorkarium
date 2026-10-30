import { describe, expect, it } from 'vitest';
import { toDocumentDto, toDocumentSummary } from '../../../src/modules/documents/documents.mapper';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { documentPo } from '../../support/documents-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
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
  it('master detail includes owners and canonical content without database-only columns', () => {
    const detail = toDocumentDto(
      documentPo(),
      [BIA_ID],
      new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
    );
    expect(detail).toMatchObject({
      ownerIds: [BIA_ID],
      schemaVersion: 1,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    expect(detail).not.toHaveProperty('campaignId');
    expect(detail).not.toHaveProperty('createdBy');
  });
});
