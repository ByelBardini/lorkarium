import { describe, expect, it } from 'vitest';
import { DocumentAssetReadPolicy } from '../../../src/modules/documents/document-asset-read-policy.service';
import {
  ACTION_ID,
  DOCUMENT_ID,
  DocumentsHarness,
  documentPo,
} from '../../support/documents-fakes';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { ANA_ID } from '../../support/auth-factories';

function policyHarness(
  inContent: boolean,
): Readonly<{ harness: DocumentsHarness; policy: DocumentAssetReadPolicy }> {
  const harness = new DocumentsHarness();
  harness.documents.rows.push(documentPo({ visibility: 'public' }));
  harness.documents.referencesRows.push({
    campaignId: VHARN_ID,
    documentId: DOCUMENT_ID,
    assetId: ACTION_ID,
    inContent,
  });
  return { harness, policy: new DocumentAssetReadPolicy((work) => work(harness.daos)) };
}
describe('DocumentAssetReadPolicy', () => {
  it('public reader cannot read prepared bytes before content confirmation', async () => {
    const { policy } = policyHarness(false);
    expect(await policy.canRead(BIA_ID, VHARN_ID, ACTION_ID)).toBe(false);
  });
  it('public reader reads confirmed bytes and loses access after document is hidden', async () => {
    const { harness, policy } = policyHarness(true);
    expect(await policy.canRead(BIA_ID, VHARN_ID, ACTION_ID)).toBe(true);
    harness.documents.rows[0]!.visibility = 'private';
    expect(await policy.canRead(BIA_ID, VHARN_ID, ACTION_ID)).toBe(false);
  });
  it('owner reads prepared private bytes until ownership is removed', async () => {
    const { harness, policy } = policyHarness(false);
    harness.documents.rows[0]!.visibility = 'private';
    harness.documents.ownerRows[DOCUMENT_ID] = [BIA_ID];
    expect(await policy.canRead(BIA_ID, VHARN_ID, ACTION_ID)).toBe(true);
    harness.documents.ownerRows[DOCUMENT_ID] = [];
    expect(await policy.canRead(BIA_ID, VHARN_ID, ACTION_ID)).toBe(false);
  });
  it('master cannot read an unassociated document asset', async () => {
    const { policy } = policyHarness(false);
    expect(await policy.canRead(ANA_ID, VHARN_ID, DOCUMENT_ID)).toBe(false);
  });
});
