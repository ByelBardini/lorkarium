import type { AssetDto, LibraryImageDto } from '@lorkarium/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DocumentImagePicker } from '@/features/documents/document-image-picker';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import { DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, ITEMS_TAB_ID } from '../../support/documents-fixtures';

const asset: AssetDto = {
  id: '10000000-0000-4000-8000-000000000010',
  width: 80,
  height: 40,
  mimeType: 'image/png',
};
class ImageChoiceRecorder {
  choices: (AssetDto | null)[] = [];
  choose = (choice: AssetDto | null): void => {
    this.choices.push(choice);
  };
}
function picker(ready = true): { api: DocumentsApiFake; recorder: ImageChoiceRecorder } {
  const api = new DocumentsApiFake();
  if (ready) api.imageResult = { ok: true, value: asset };
  const recorder = new ImageChoiceRecorder();
  const image: LibraryImageDto = {
    id: '10000000-0000-4000-8000-000000000011',
    name: 'Retrato',
    folderId: null,
    visibility: 'public',
    asset,
    updatedAt: '2026-10-29T12:00:00.000Z',
  };
  render(
    <DocumentImagePicker
      api={api}
      campaignId={DOCUMENT_CAMPAIGN_ID}
      documentId={DOCUMENT_ID}
      tabId={ITEMS_TAB_ID}
      images={[image]}
      onChoose={recorder.choose}
    />,
  );
  return { api, recorder };
}
describe('document scoped image selection', () => {
  it('sends a computer image to the open tab and returns only the kept asset', async () => {
    const { api, recorder } = picker();
    const file = new File(['png pixels'], 'carta.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Arquivo de imagem'), file);
    await waitFor(() => expect(recorder.choices).toEqual([asset]));
    expect(api.imageRequests).toEqual([
      {
        operation: 'upload',
        campaignId: DOCUMENT_CAMPAIGN_ID,
        documentId: DOCUMENT_ID,
        tabId: ITEMS_TAB_ID,
        file,
      },
    ]);
  });
  it("imports and trims a URL using the open tab's endpoint instead of persisting a hotlink", async () => {
    const { api, recorder } = picker();
    await userEvent.click(screen.getByRole('button', { name: 'Usar link de imagem' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Link da imagem' }),
      ' https://example.test/carta.png ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Usar link' }));
    await waitFor(() => expect(recorder.choices).toEqual([asset]));
    expect(api.imageRequests).toEqual([
      {
        operation: 'import',
        campaignId: DOCUMENT_CAMPAIGN_ID,
        documentId: DOCUMENT_ID,
        tabId: ITEMS_TAB_ID,
        source: 'https://example.test/carta.png',
      },
    ]);
  });
  it('associates a selected library image with the open tab before insertion', async () => {
    const { api, recorder } = picker();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Imagem da biblioteca' }),
      '10000000-0000-4000-8000-000000000011',
    );
    await waitFor(() => expect(recorder.choices).toEqual([asset]));
    expect(api.imageRequests).toEqual([
      {
        operation: 'library',
        campaignId: DOCUMENT_CAMPAIGN_ID,
        documentId: DOCUMENT_ID,
        tabId: ITEMS_TAB_ID,
        source: '10000000-0000-4000-8000-000000000011',
      },
    ]);
  });
  it('leaves insertion pending on failed association and permits cancelling without a replacement', async () => {
    const { api, recorder } = picker(false);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Imagem da biblioteca' }),
      '10000000-0000-4000-8000-000000000011',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor.');
    expect(recorder.choices).toEqual([]);
    expect(api.imageRequests).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(recorder.choices).toEqual([null]);
  });
  it('refuses unsupported GIF locally without calling the document upload endpoint', async () => {
    const { api, recorder } = picker();
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(
      screen.getByLabelText('Arquivo de imagem'),
      new File(['gif'], 'animado.gif', { type: 'image/gif' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/PNG|JPEG|WebP/);
    expect(api.imageRequests).toEqual([]);
    expect(recorder.choices).toEqual([]);
  });
});
