import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { DocumentAccessBo } from '../../../src/modules/documents/document-access.bo';
import {
  DocumentTabsBo,
  type DocumentTabState,
} from '../../../src/modules/documents/document-tabs.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { DOCUMENT_ID } from '../../support/documents-fakes';

const A = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const B = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
const C = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c';
const FOREIGN = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';
type Reader = 'ana' | 'bia' | 'caio';
const READERS: Record<Reader, Readonly<{ userId: string; role: 'master' | 'player' }>> = {
  ana: { userId: ANA_ID, role: 'master' },
  bia: { userId: BIA_ID, role: 'player' },
  caio: { userId: CAIO_ID, role: 'player' },
};
function tab(id: string, position: number, visibility: 'document' | 'masters' = 'document') {
  return { id, position, visibility } satisfies DocumentTabState;
}
// A public document owned by Bia: A "Geral", B "Segredos" (masters only), C "Itens".
const SECRET_IN_THE_MIDDLE = [tab(A, 0), tab(B, 1, 'masters'), tab(C, 2)];
function tabsFor(
  reader: Reader,
  tabs: readonly DocumentTabState[] = SECRET_IN_THE_MIDDLE,
  limit = 200,
): DocumentTabsBo<DocumentTabState> {
  const { userId, role } = READERS[reader];
  const access = new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
  const document = new DocumentAccessBo(access, {
    id: DOCUMENT_ID,
    visibility: 'public',
    ownerIds: [BIA_ID],
    version: 5,
  });
  return new DocumentTabsBo(document, tabs, limit);
}
function positionsOf(order: readonly { id: string; position: number }[]): string[] {
  return [...order].sort((left, right) => left.position - right.position).map((t) => t.id);
}

describe('DocumentTabsBo', () => {
  it('the owner creating a third tab gets position 2', () => {
    expect(tabsFor('bia', [tab(A, 0), tab(C, 1)]).requireCreate()).toBe(2);
  });
  it('a new tab goes after the highest position even when positions have gaps', () => {
    expect(tabsFor('ana', [tab(A, 0), tab(C, 7)]).requireCreate()).toBe(8);
  });
  it('the master may hide a tab from the players', () => {
    expect(tabsFor('ana').requireVisibilityChange(C)).toMatchObject({ id: C });
  });
  it('the master sees every tab and the owner loses the masters-only one', () => {
    expect(
      tabsFor('ana')
        .visibleTo()
        .map((t) => t.id),
    ).toEqual([A, B, C]);
    expect(
      tabsFor('bia')
        .visibleTo()
        .map((t) => t.id),
    ).toEqual([A, C]);
  });
  it('a document whose tabs are all masters-only gives the player no tab', () => {
    expect(tabsFor('caio', [tab(B, 0, 'masters')]).visibleTo()).toEqual([]);
  });
  it('the owner reordering [C, A] around the hidden B keeps B in its slot (A, B, C → C, B, A)', () => {
    expect(positionsOf(tabsFor('bia').mergedOrder([C, A]))).toEqual([C, B, A]);
  });
  it('a visible tab missing from the order keeps its slot like a hidden one', () => {
    expect(positionsOf(tabsFor('ana').mergedOrder([C, B]))).toEqual([A, C, B]);
  });
  it('the merged order renumbers positions from zero without gaps', () => {
    const order = tabsFor('ana', [tab(A, 3), tab(C, 9)]).mergedOrder([C, A]);
    expect(order).toEqual([
      { id: C, position: 0 },
      { id: A, position: 1 },
    ]);
  });
  it('the 200th tab passes and the 201st is refused with DOCUMENT_TAB_LIMIT', () => {
    const tabs = (count: number) => Array.from({ length: count }, (_, i) => tab(`${i}`, i));
    expect(tabsFor('ana', tabs(199)).requireCreate()).toBe(199);
    expect(() => tabsFor('ana', tabs(200)).requireCreate()).toThrow(
      expect.objectContaining({
        code: 'DOCUMENT_TAB_LIMIT',
        message: expect.stringContaining('would have 201 tabs; expected at most 200'),
      }),
    );
  });
  it('deleting the only tab of the document is refused with DOCUMENT_TAB_LAST', () => {
    expect(() => tabsFor('ana', [tab(A, 0)]).requireDelete(A)).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_TAB_LAST' }),
    );
    expect(tabsFor('ana', [tab(A, 0), tab(C, 1)]).requireDelete(A)).toMatchObject({ id: A });
  });
  it.each([
    ['reads', (bo: DocumentTabsBo<DocumentTabState>) => bo.requireVisible(B)],
    ['renames', (bo: DocumentTabsBo<DocumentTabState>) => bo.requireEdit(B)],
    ['deletes', (bo: DocumentTabsBo<DocumentTabState>) => bo.requireDelete(B)],
    ['hides', (bo: DocumentTabsBo<DocumentTabState>) => bo.requireVisibilityChange(B)],
  ])('the owner who %s the hidden tab gets DOCUMENT_TAB_NOT_FOUND, never FORBIDDEN', (_, act) => {
    expect(() => act(tabsFor('bia'))).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_TAB_NOT_FOUND' }),
    );
  });
  it('the owner changing the visibility of a visible tab is refused with FORBIDDEN', () => {
    expect(() => tabsFor('bia').requireVisibilityChange(C)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
  it('a reader without ownership creating a tab in a public document gets FORBIDDEN', () => {
    expect(() => tabsFor('caio').requireCreate()).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
  it('a reader without ownership renaming a visible tab gets FORBIDDEN', () => {
    expect(() => tabsFor('caio').requireEdit(A)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
  it('reordering with an id outside the document is refused citing that id', () => {
    expect(() => tabsFor('ana').mergedOrder([A, FOREIGN])).toThrow(
      expect.objectContaining({
        code: 'DOCUMENT_TAB_NOT_FOUND',
        message: expect.stringContaining(FOREIGN),
      }),
    );
  });
  it('the owner reordering with the hidden tab id is refused as not found', () => {
    expect(() => tabsFor('bia').mergedOrder([B, A, C])).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_TAB_NOT_FOUND' }),
    );
  });
});
