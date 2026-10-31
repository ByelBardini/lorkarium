import { describe, expect, it } from 'vitest';
import {
  DocumentWriteSteps,
  commandFingerprint,
  documentAssetIds,
} from '../../../src/modules/documents/document-writes.service';
import { DOCUMENT_ID, DocumentsHarness, ITENS_TAB_ID } from '../../support/documents-fakes';

const MAP = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const PORTRAIT = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
describe('document write steps', () => {
  it('finds each image of a body once, nested in tables and quotes', () => {
    expect(
      documentAssetIds({
        type: 'doc',
        content: [
          { type: 'image', attrs: { assetId: MAP } },
          {
            type: 'blockquote',
            content: [
              { type: 'image', attrs: { assetId: PORTRAIT } },
              { type: 'image', attrs: { assetId: MAP } },
            ],
          },
        ],
      }).sort(),
    ).toEqual([MAP, PORTRAIT].sort());
  });
  it('the fingerprint ignores the key order of the command and tells targets apart', () => {
    const first = commandFingerprint('tab-update', ITENS_TAB_ID, { name: 'Itens', actionId: MAP });
    const reordered = commandFingerprint('tab-update', ITENS_TAB_ID, {
      actionId: MAP,
      name: 'Itens',
    });
    expect(reordered).toBe(first);
    expect(
      commandFingerprint('tab-update', DOCUMENT_ID, { name: 'Itens', actionId: MAP }),
    ).not.toBe(first);
  });
  it('publishes library:changed only for an applied command', () => {
    const harness = new DocumentsHarness();
    const steps = new DocumentWriteSteps(harness.deps);
    expect(steps.published(DOCUMENT_ID, { value: 'replayed', changed: false })).toBe('replayed');
    expect(harness.journal).toEqual([]);
    steps.published(DOCUMENT_ID, { value: 'applied', changed: true });
    expect(harness.journal).toEqual(['publish']);
  });
});
