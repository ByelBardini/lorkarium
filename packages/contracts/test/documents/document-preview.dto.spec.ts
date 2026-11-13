import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_PREVIEW_SUMMARY_MAX_LENGTH,
  documentReceiptDto,
  documentSummaryDto,
  updateDocumentPreviewRequestDto,
} from '../../src';

const id = '00000000-0000-4000-8000-000000000001';
const action = { actionId: id, expectedVersion: 3 };
const summary = {
  id,
  name: 'Carta',
  folderId: null,
  visibility: 'private',
  version: 3,
  updatedAt: '2026-11-12T10:00:00.000Z',
  canEdit: true,
  canManage: true,
};

describe('document preview command', () => {
  it('trims the summary and keeps the chosen image', () => {
    expect(
      updateDocumentPreviewRequestDto.parse({
        ...action,
        summary: '  Uma carta selada.  ',
        imageAssetId: id,
      }),
    ).toEqual({ ...action, summary: 'Uma carta selada.', imageAssetId: id });
  });
  it(`accepts ${DOCUMENT_PREVIEW_SUMMARY_MAX_LENGTH} characters and refuses one more`, () => {
    const at = (length: number): boolean =>
      updateDocumentPreviewRequestDto.safeParse({
        ...action,
        summary: 'a'.repeat(length),
        imageAssetId: null,
      }).success;
    expect(at(DOCUMENT_PREVIEW_SUMMARY_MAX_LENGTH)).toBe(true);
    expect(at(DOCUMENT_PREVIEW_SUMMARY_MAX_LENGTH + 1)).toBe(false);
  });
  it('clears with null and refuses a blank summary, which must come as null', () => {
    expect(
      updateDocumentPreviewRequestDto.safeParse({ ...action, summary: null, imageAssetId: null })
        .success,
    ).toBe(true);
    expect(
      updateDocumentPreviewRequestDto.safeParse({ ...action, summary: '   ', imageAssetId: null })
        .success,
    ).toBe(false);
  });
  it('asks for the whole preview: an omitted field or an image that is not an id is refused', () => {
    expect(updateDocumentPreviewRequestDto.safeParse({ ...action, summary: null }).success).toBe(
      false,
    );
    expect(
      updateDocumentPreviewRequestDto.safeParse({
        ...action,
        summary: null,
        imageAssetId: 'https://example.com/a.png',
      }).success,
    ).toBe(false);
  });
  it('refuses a field outside the preview', () => {
    expect(
      updateDocumentPreviewRequestDto.safeParse({
        ...action,
        summary: null,
        imageAssetId: null,
        name: 'Carta',
      }).success,
    ).toBe(false);
  });
});

describe('document preview in the summary', () => {
  it('is required in every summary the library lists', () => {
    expect(documentSummaryDto.safeParse(summary).success).toBe(false);
    expect(
      documentSummaryDto.parse({ ...summary, preview: { summary: null, imageAssetId: id } }),
    ).toMatchObject({ preview: { summary: null, imageAssetId: id } });
  });
  it('has its own receipt operation', () => {
    expect(
      documentReceiptDto.parse({ actionId: id, documentId: id, version: 4, operation: 'preview' }),
    ).toMatchObject({ operation: 'preview' });
  });
});
