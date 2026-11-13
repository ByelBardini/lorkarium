import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { DocumentAccessBo } from '../../../src/modules/documents/document-access.bo';
import {
  DocumentPreviewBo,
  type DocumentTabImageReference,
} from '../../../src/modules/documents/document-preview.bo';
import type { DocumentTabState } from '../../../src/modules/documents/document-tabs.bo';
import { DocumentError } from '../../../src/modules/documents/documents.error';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { DOCUMENT_ID } from '../../support/documents-fakes';

const GERAL = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const SEGREDOS = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
const MAPA = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const SELO = '1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b';
const CURRENT = '1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c';
const ELSEWHERE = '1f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f';
// A public document owned by Bia: "Geral" for everyone, "Segredos" only for the masters.
const TABS: readonly DocumentTabState[] = [
  { id: GERAL, position: 0, visibility: 'document' },
  { id: SEGREDOS, position: 1, visibility: 'masters' },
];
const REFERENCES: readonly DocumentTabImageReference[] = [
  { tabId: GERAL, assetId: MAPA },
  { tabId: SEGREDOS, assetId: SELO },
];
function previewFor(userId: string, role: 'master' | 'player'): DocumentPreviewBo {
  const access = new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
  const document = new DocumentAccessBo(access, {
    id: DOCUMENT_ID,
    visibility: 'public',
    hiddenByFolder: false,
    ownerIds: [BIA_ID],
    version: 4,
  });
  return new DocumentPreviewBo(document, TABS, REFERENCES, CURRENT);
}
const bia = (): DocumentPreviewBo => previewFor(BIA_ID, 'player');
const ana = (): DocumentPreviewBo => previewFor(ANA_ID, 'master');

describe('DocumentPreviewBo', () => {
  it('takes no cover at all', () => {
    expect(() => bia().requireImage(null)).not.toThrow();
  });
  it('keeps the current cover even when no tab holds it any more', () => {
    expect(() => bia().requireImage(CURRENT)).not.toThrow();
  });
  it('takes an image of a tab the owner sees', () => {
    expect(() => bia().requireImage(MAPA)).not.toThrow();
  });
  it('refuses the owner an image only in the masters-only tab, naming the image', () => {
    expect(() => bia().requireImage(SELO)).toThrow(
      expect.objectContaining({
        code: 'DOCUMENT_ASSET_NOT_FOUND',
        message: expect.stringContaining(SELO),
      }),
    );
  });
  it('lets the master use an image of the masters-only tab', () => {
    expect(() => ana().requireImage(SELO)).not.toThrow();
  });
  it('refuses an image associated with no tab of the document, even to the master', () => {
    expect(() => ana().requireImage(ELSEWHERE)).toThrow(DocumentError);
  });
});
