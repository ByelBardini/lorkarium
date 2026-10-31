import { describe, expect, it } from 'vitest';
import {
  toDocumentTabDto,
  toDocumentTabSummaryDto,
} from '../../../src/modules/documents/document-tabs.mapper';
import { documentText } from '../../support/document-http';
import { ITENS_TAB_ID, documentTabPo } from '../../support/documents-fakes';

const ITENS = documentTabPo({
  id: ITENS_TAB_ID,
  name: 'Itens',
  version: 3,
  content: documentText('Corda de 15 m'),
  updatedAt: new Date('2026-10-31T10:00:00Z'),
});
describe('document tab mappers', () => {
  it('the summary carries the tab version and no body or database-only columns', () => {
    expect(toDocumentTabSummaryDto(ITENS)).toEqual({
      id: ITENS_TAB_ID,
      name: 'Itens',
      visibility: 'document',
      version: 3,
      updatedAt: '2026-10-31T10:00:00.000Z',
    });
  });
  it('the opened tab carries schema version 1 and its canonical content', () => {
    expect(toDocumentTabDto(ITENS)).toMatchObject({
      id: ITENS_TAB_ID,
      schemaVersion: 1,
      content: documentText('Corda de 15 m'),
    });
  });
  it('a stored body outside the contract is refused instead of being served', () => {
    expect(() => toDocumentTabDto(documentTabPo({ content: { type: 'script' } }))).toThrow();
  });
});
