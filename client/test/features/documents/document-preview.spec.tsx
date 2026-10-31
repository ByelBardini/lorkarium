import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DocumentPreview } from '@/features/documents/document-preview';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import { documentFixture, DOCUMENT_CAMPAIGN_ID } from '../../support/documents-fixtures';

class DocumentPreviewActions {
  actions: string[] = [];
  open = (): void => {
    this.actions.push('tab');
  };
  window = (): void => {
    this.actions.push('window');
  };
}
function preview() {
  const api = new DocumentsApiFake();
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
});
