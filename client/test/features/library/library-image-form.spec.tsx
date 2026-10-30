import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LibraryImageForm } from '@/features/library/library-image-form';
import { AssetsApiFake, LYRA_PORTRAIT } from '../../support/assets-api-fake';
import { LibraryApiFake } from '../../support/library-api-fake';
import { CATACUMBAS, PORTRAIT } from '../../support/library-fixtures';
import { VHARN } from '../../support/campaigns-api-fake';

function form(live = true) {
  const assets = new AssetsApiFake();
  const api = new LibraryApiFake();
  const saved = vi.fn();
  render(
    <LibraryImageForm
      campaignId={VHARN.id}
      folderId={CATACUMBAS.id}
      assets={assets}
      api={api}
      live={live}
      onSaved={saved}
      onClose={() => undefined}
    />,
  );
  return { assets, api, saved };
}
async function fillImage(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Nome da imagem'), '  Retrato  ');
  await userEvent.upload(
    screen.getByLabelText('Arquivo de imagem'),
    new File(['png'], 'portrait.png', { type: 'image/png' }),
  );
}

describe('new library image', () => {
  it('explicit public visibility is sent on registration and confirmed by the server', async () => {
    const { api, saved } = form();
    api.answer('createImage', { ok: true, value: { ...PORTRAIT, visibility: 'public' } });
    await fillImage();
    await userEvent.click(screen.getByRole('radio', { name: 'Pública' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar imagem' }));
    expect(api.callsOf('createImage')[0]).toEqual([
      expect.objectContaining({ visibility: 'public' }),
    ]);
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'public' }));
  });
  it('disconnection blocks entering a new name and submitting a registration', () => {
    const { api } = form(false);
    expect(screen.getByLabelText('Nome da imagem')).toBeDisabled();
    expect(screen.queryByRole('combobox', { name: 'Pasta' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar imagem' })).toBeDisabled();
    expect(api.callsOf('createImage')).toEqual([]);
  });
  it('requires an uploaded asset and creates privately in the selected folder', async () => {
    const { assets, api, saved } = form();
    expect(screen.getByRole('button', { name: 'Salvar imagem' })).toBeDisabled();
    await fillImage();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar imagem' }));
    expect(assets.sent[0]).toMatchObject({
      kind: 'upload',
      purpose: 'library_image',
      campaignId: VHARN.id,
    });
    expect(api.callsOf('createImage')).toEqual([
      [
        {
          name: 'Retrato',
          assetId: LYRA_PORTRAIT.id,
          folderId: CATACUMBAS.id,
          visibility: 'private',
        },
      ],
    ]);
    expect(saved).toHaveBeenCalledWith(PORTRAIT);
  });
  it('registration failure preserves the name and reuses the uploaded asset on retry', async () => {
    const { assets, api } = form();
    api.answer('createImage', { ok: false, failure: { kind: 'offline' } });
    await fillImage();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar imagem' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão');
    expect(screen.getByLabelText('Nome da imagem')).toHaveValue('  Retrato  ');
    api.answer('createImage', { ok: true, value: PORTRAIT });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar imagem' }));
    expect(assets.sent).toHaveLength(1);
    expect(api.callsOf('createImage')).toHaveLength(2);
  });
  it('pending upload prevents registration until normalization finishes', async () => {
    const { assets, api } = form();
    assets.hold();
    await fillImage();
    expect(screen.getByRole('button', { name: 'Salvar imagem' })).toBeDisabled();
    expect(api.callsOf('createImage')).toEqual([]);
    await act(() => assets.release());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar imagem' })).toBeEnabled(),
    );
  });
  it('blocked import shows the reason and never registers an empty item', async () => {
    const { assets, api } = form();
    assets.answerWith({ ok: false, failure: { kind: 'link_blocked' } });
    await userEvent.click(screen.getByRole('button', { name: 'Usar link de imagem' }));
    await userEvent.type(screen.getByLabelText('Link da imagem'), 'http://localhost/private.png');
    await userEvent.click(screen.getByRole('button', { name: 'Usar link' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.callsOf('createImage')).toEqual([]);
    expect(screen.getByRole('button', { name: 'Salvar imagem' })).toBeDisabled();
  });
});
