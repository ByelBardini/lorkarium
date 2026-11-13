import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DocumentPreview } from '@/features/documents/document-preview';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import {
  documentFixture,
  documentTabFixture,
  documentText,
  DOCUMENT_CAMPAIGN_ID,
  ITEMS_TAB_ID,
  threeTabs,
} from '../../support/documents-fixtures';

class DocumentPreviewActions {
  actions: string[] = [];
  window = (): void => {
    this.actions.push('window');
  };
}
function preview(api = new DocumentsApiFake(), summary = documentFixture()) {
  const actions = new DocumentPreviewActions();
  render(
    <DocumentPreview
      campaignId={DOCUMENT_CAMPAIGN_ID}
      summary={summary}
      api={api}
      live
      onOpenWindow={actions.window}
    />,
  );
  return { api, actions };
}
describe('library document preview', () => {
  it('shows authorized text as a preview without editing or administrative controls', async () => {
    preview();
    expect(
      await screen.findByRole('document', { name: 'Conteúdo do documento' }),
    ).toHaveTextContent('A');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Donos que podem editar:')).not.toBeInTheDocument();
  });
  it('offers only the window: the tab opens from the tree, by a double click or Enter', async () => {
    const { actions } = preview();
    await screen.findByRole('document', { name: 'Conteúdo do documento' });
    expect(screen.queryByRole('button', { name: 'Expandir documento' })).toBeNull();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Abrir em outra janela',
    ]);
    expect(actions.actions).toEqual([]);
  });
  it('offers an independent window without starting another editor in the library', async () => {
    const { actions } = preview();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Abrir documento em outra janela' }),
    );
    expect(actions.actions).toEqual(['window']);
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
  it('shows the first tab listed and lets the reader pick another', async () => {
    const api = new DocumentsApiFake();
    api.document = documentFixture({ tabs: threeTabs().slice(0, 2) });
    api.writeTab(
      documentTabFixture({ id: ITEMS_TAB_ID, name: 'Itens', content: documentText('Espada') }),
    );
    preview(api);
    const reader = await screen.findByRole('document', { name: 'Conteúdo do documento' });
    expect(reader).toHaveTextContent('A');
    await userEvent.click(screen.getByRole('button', { name: 'Aba da prévia' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Itens' }));
    await waitFor(() =>
      expect(screen.getByRole('document', { name: 'Conteúdo do documento' })).toHaveTextContent(
        'Espada',
      ),
    );
    expect(api.tabReads.at(-1)).toBe(ITEMS_TAB_ID);
  });
  it('a document with one tab has no tab picker', async () => {
    preview();
    await screen.findByRole('document', { name: 'Conteúdo do documento' });
    expect(screen.queryByRole('button', { name: 'Aba da prévia' })).not.toBeInTheDocument();
  });
});

const COVER_ID = '10000000-0000-4000-8000-000000000010';
describe('library document preview set by its editors', () => {
  it('shows the cover and the summary instead of the body, without reading the document', async () => {
    const api = new DocumentsApiFake();
    preview(
      api,
      documentFixture({ preview: { summary: 'Uma carta selada.', imageAssetId: COVER_ID } }),
    );
    expect(screen.getByRole('img', { name: 'Capa do documento' })).toHaveAttribute(
      'src',
      `/api/assets/${COVER_ID}`,
    );
    expect(screen.getByText('Uma carta selada.')).toBeInTheDocument();
    expect(screen.queryByRole('document', { name: 'Conteúdo do documento' })).toBeNull();
    expect(api.detailCalls).toBe(0);
    expect(api.tabReads).toEqual([]);
  });
  it('a summary alone is enough, with no cover drawn', () => {
    preview(
      undefined,
      documentFixture({ preview: { summary: 'Só o resumo.', imageAssetId: null } }),
    );
    expect(screen.getByText('Só o resumo.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Capa do documento' })).toBeNull();
  });
  it('a cover alone is enough', () => {
    preview(undefined, documentFixture({ preview: { summary: null, imageAssetId: COVER_ID } }));
    expect(screen.getByRole('img', { name: 'Capa do documento' })).toBeInTheDocument();
  });
});
