import type {
  AssetDto,
  DocumentDto,
  DocumentPreviewDto,
  DocumentWriteResponseDto,
  LibraryImageDto,
} from '@lorkarium/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DocumentPreviewFields } from '@/features/documents/document-preview-fields';
import type { DocumentsResult } from '@/services/documents-api';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import {
  DOCUMENT_CAMPAIGN_ID,
  ITEMS_TAB_ID,
  documentFixture,
  documentWrite,
} from '../../support/documents-fixtures';
import { vharnLibrary } from '../../support/library-fixtures';

const COVER: AssetDto = {
  id: '10000000-0000-4000-8000-000000000010',
  width: 80,
  height: 40,
  mimeType: 'image/png',
};
const PORTRAIT: LibraryImageDto = {
  id: '10000000-0000-4000-8000-000000000011',
  name: 'Retrato',
  folderId: null,
  visibility: 'public',
  asset: COVER,
  updatedAt: '2026-10-29T12:00:00.000Z',
};
/** Records each preview the block asks to save and answers with `answer`. */
class PreviewSaveRecorder {
  saved: DocumentPreviewDto[] = [];
  answer: DocumentsResult<DocumentWriteResponseDto> = {
    ok: true,
    value: documentWrite(documentFixture(), 'preview'),
  };
  save = async (
    preview: DocumentPreviewDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> => {
    this.saved.push(preview);
    return this.answer;
  };
}
type Setup = Readonly<{ document?: DocumentDto; canEdit?: boolean }>;
function previewBlock(setup: Setup = {}) {
  const api = new DocumentsApiFake();
  const recorder = new PreviewSaveRecorder();
  const props = {
    api,
    campaignId: DOCUMENT_CAMPAIGN_ID,
    library: vharnLibrary({ images: [PORTRAIT] }),
    tabId: ITEMS_TAB_ID,
    canEdit: setup.canEdit ?? true,
    onSave: recorder.save,
  };
  const view = render(
    <DocumentPreviewFields document={setup.document ?? documentFixture()} {...props} />,
  );
  const rerender = (document: DocumentDto): void =>
    view.rerender(<DocumentPreviewFields document={document} {...props} />);
  return { api, recorder, rerender };
}
const withPreview = (preview: DocumentPreviewDto): DocumentDto => documentFixture({ preview });
const unfold = (): Promise<void> => userEvent.click(screen.getByRole('button', { name: /Prévia/ }));
const summaryField = (): HTMLElement => screen.getByRole('textbox', { name: 'Resumo da prévia' });

describe('document preview block', () => {
  it('is not there for a reader of the document', () => {
    previewBlock({ document: documentFixture({ canEdit: false }) });
    expect(screen.queryByRole('region', { name: 'Prévia na biblioteca' })).toBeNull();
  });
  it('starts folded, saying the library shows the content thumbnail', async () => {
    previewBlock();
    const toggle = screen.getByRole('button', { name: /Prévia/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('miniatura do conteúdo');
    expect(screen.queryByRole('textbox', { name: 'Resumo da prévia' })).toBeNull();
    await unfold();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(summaryField()).toBeInTheDocument();
  });
  it('saves the trimmed summary on leaving the field, keeping the cover', async () => {
    const { recorder } = previewBlock({
      document: withPreview({ summary: null, imageAssetId: COVER.id }),
    });
    await unfold();
    await userEvent.type(summaryField(), '  Uma carta selada.  ');
    await userEvent.tab();
    expect(recorder.saved).toEqual([{ summary: 'Uma carta selada.', imageAssetId: COVER.id }]);
  });
  it('clearing the summary sends null, and leaving it unchanged sends nothing', async () => {
    const { recorder } = previewBlock({
      document: withPreview({ summary: 'Velho', imageAssetId: null }),
    });
    await unfold();
    await userEvent.click(summaryField());
    await userEvent.tab();
    expect(recorder.saved).toEqual([]);
    await userEvent.clear(summaryField());
    await userEvent.tab();
    expect(recorder.saved).toEqual([{ summary: null, imageAssetId: null }]);
  });
  it('a library image becomes the cover through the shown tab', async () => {
    const { api, recorder } = previewBlock();
    api.imageResult = { ok: true, value: COVER };
    await unfold();
    await userEvent.click(screen.getByRole('button', { name: 'Escolher capa' }));
    expect(screen.getByRole('dialog', { name: 'Capa da prévia' })).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Imagem da biblioteca' }),
      PORTRAIT.id,
    );
    await waitFor(() =>
      expect(recorder.saved).toEqual([{ summary: null, imageAssetId: COVER.id }]),
    );
    expect(api.imageRequests).toMatchObject([
      { operation: 'library', tabId: ITEMS_TAB_ID, source: PORTRAIT.id },
    ]);
  });
  it('shows the cover and removes it', async () => {
    const { recorder } = previewBlock({
      document: withPreview({ summary: 'Selada.', imageAssetId: COVER.id }),
    });
    expect(screen.getByRole('button', { name: /Prévia/ })).toHaveTextContent('resumo e capa');
    await unfold();
    expect(screen.getByRole('img', { name: 'Capa da prévia' })).toHaveAttribute(
      'src',
      `/api/assets/${COVER.id}`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remover capa' }));
    expect(recorder.saved).toEqual([{ summary: 'Selada.', imageAssetId: null }]);
  });
  it('a refused save says why', async () => {
    const { recorder } = previewBlock();
    recorder.answer = { ok: false, failure: { kind: 'not_found' } };
    await unfold();
    await userEvent.type(summaryField(), 'Selada.');
    await userEvent.tab();
    expect(await screen.findByRole('alert')).toHaveTextContent('Documento indisponível.');
  });
  it('a summary saved elsewhere replaces the field', async () => {
    const { rerender } = previewBlock();
    await unfold();
    rerender(withPreview({ summary: 'Escrito pela Ana.', imageAssetId: null }));
    expect(summaryField()).toHaveValue('Escrito pela Ana.');
  });
  it('offline, the fields are there but cannot be changed', async () => {
    previewBlock({ canEdit: false });
    await unfold();
    expect(summaryField()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Escolher capa' })).toBeDisabled();
  });
});
