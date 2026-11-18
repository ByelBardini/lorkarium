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
    expect(toDocumentTabSummaryDto(ITENS, false)).toEqual({
      id: ITENS_TAB_ID,
      name: 'Itens',
      visibility: 'document',
      version: 3,
      updatedAt: '2026-10-31T10:00:00.000Z',
      planLocked: false,
    });
  });
  it('a tab past the plan carries planLocked in the summary and in the opened tab', () => {
    expect(toDocumentTabSummaryDto(ITENS, true).planLocked).toBe(true);
    expect(toDocumentTabDto(ITENS, true).planLocked).toBe(true);
  });
  it('the opened tab carries schema version 1 and its canonical content', () => {
    expect(toDocumentTabDto(ITENS, false)).toMatchObject({
      id: ITENS_TAB_ID,
      schemaVersion: 1,
      content: documentText('Corda de 15 m'),
    });
  });
  it('a stored body outside the contract is refused instead of being served', () => {
    expect(() => toDocumentTabDto(documentTabPo({ content: { type: 'script' } }), false)).toThrow();
  });
});
