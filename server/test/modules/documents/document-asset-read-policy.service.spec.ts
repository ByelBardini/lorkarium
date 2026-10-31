import { describe, expect, it } from 'vitest';
import { DocumentAssetReadPolicy } from '../../../src/modules/documents/document-asset-read-policy.service';
import {
  ACTION_ID,
  DOCUMENT_ID,
  DocumentsHarness,
  GERAL_TAB_ID,
  SEGREDOS_TAB_ID,
  documentAssetPo,
} from '../../support/documents-fakes';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { ANA_ID } from '../../support/auth-factories';

// A public "Diário" with "Geral" and the masters-only "Segredos"; the image is ACTION_ID.
function policyHarness(
  ...references: Readonly<{ tabId: string; inContent: boolean }>[]
): Readonly<{ harness: DocumentsHarness; policy: DocumentAssetReadPolicy }> {
  const harness = new DocumentsHarness().withSecretTab({ visibility: 'public' });
  harness.assets.rows.push(...references.map((reference) => documentAssetPo(reference)));
  return { harness, policy: new DocumentAssetReadPolicy((work) => work(harness.daos)) };
}
describe('DocumentAssetReadPolicy', () => {
  it('public reader cannot read prepared bytes before content confirmation', async () => {
    const { policy } = policyHarness({ tabId: GERAL_TAB_ID, inContent: false });
    expect(await policy.canRead(CAIO_ID, VHARN_ID, ACTION_ID)).toBe(false);
  });
  it('public reader reads confirmed bytes and loses access after document is hidden', async () => {
    const { harness, policy } = policyHarness({ tabId: GERAL_TAB_ID, inContent: true });
    expect(await policy.canRead(CAIO_ID, VHARN_ID, ACTION_ID)).toBe(true);
    harness.documents.rows[0]!.visibility = 'private';
    expect(await policy.canRead(CAIO_ID, VHARN_ID, ACTION_ID)).toBe(false);
  });
  it('owner reads prepared private bytes until ownership is removed', async () => {
    const { harness, policy } = policyHarness({ tabId: GERAL_TAB_ID, inContent: false });
    harness.documents.rows[0]!.visibility = 'private';
    harness.documents.ownerRows[DOCUMENT_ID] = [BIA_ID];
    expect(await policy.canRead(BIA_ID, VHARN_ID, ACTION_ID)).toBe(true);
    harness.documents.ownerRows[DOCUMENT_ID] = [];
    expect(await policy.canRead(BIA_ID, VHARN_ID, ACTION_ID)).toBe(false);
  });
  it('an image only in the masters-only tab is refused to the reader and served to the master', async () => {
    const { policy } = policyHarness({ tabId: SEGREDOS_TAB_ID, inContent: true });
    expect(await policy.canRead(CAIO_ID, VHARN_ID, ACTION_ID)).toBe(false);
    expect(await policy.canRead(ANA_ID, VHARN_ID, ACTION_ID)).toBe(true);
  });
  it('the owner does not read an image prepared in the masters-only tab', async () => {
    const { harness, policy } = policyHarness({ tabId: SEGREDOS_TAB_ID, inContent: false });
    harness.documents.ownerRows[DOCUMENT_ID] = [BIA_ID];
    expect(await policy.canRead(BIA_ID, VHARN_ID, ACTION_ID)).toBe(false);
  });
  it('the same image in a visible tab and in the secret one stays readable', async () => {
    const { policy } = policyHarness(
      { tabId: SEGREDOS_TAB_ID, inContent: true },
      { tabId: GERAL_TAB_ID, inContent: true },
    );
    expect(await policy.canRead(CAIO_ID, VHARN_ID, ACTION_ID)).toBe(true);
  });
  it('master cannot read an unassociated document asset', async () => {
    const { policy } = policyHarness({ tabId: GERAL_TAB_ID, inContent: false });
    expect(await policy.canRead(ANA_ID, VHARN_ID, DOCUMENT_ID)).toBe(false);
  });
});
