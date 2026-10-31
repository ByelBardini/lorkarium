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
  open = (): void => {
    this.actions.push('tab');
  };
  window = (): void => {
    this.actions.push('window');
  };
}
function preview(api = new DocumentsApiFake()) {
  const actions = new DocumentPreviewActions();
  render(
    <DocumentPreview
      campaignId={DOCUMENT_CAMPAIGN_ID}
      summary={documentFixture()}
      api={api}
      live
      onOpen={actions.open}
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
  it('opens a tab only after the explicit expansion action', async () => {
    const { actions } = preview();
    expect(actions.actions).toEqual([]);
    await userEvent.click(await screen.findByRole('button', { name: 'Expandir documento' }));
    expect(actions.actions).toEqual(['tab']);
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
