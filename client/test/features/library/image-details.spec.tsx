import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { LibraryIntent } from '@/features/library/library-intents';
import { ImageDetails } from '@/features/library/image-details';
import { createImagePresentationStore } from '@/stores/image-presentation-store';
import { ImagePresentationApiFake } from '../../support/image-presentation-api-fake';
import { masterLibrary, PORTRAIT } from '../../support/library-fixtures';
import { StorageFake } from '../../support/storage-fake';
import { VHARN } from '../../support/campaigns-api-fake';

class LibrarySubmitRecorder {
  readonly sent: LibraryIntent[] = [];
  async submit(intent: LibraryIntent): Promise<void> {
    this.sent.push(intent);
  }
}
function panel(isMaster = true, live = true) {
  const commands = new LibrarySubmitRecorder();
  const api = new ImagePresentationApiFake();
  const store = createImagePresentationStore({
    campaignId: VHARN.id,
    userId: 'ana',
    storage: new StorageFake(),
    api,
  });
  render(
    <ImageDetails
      image={PORTRAIT}
      library={masterLibrary()}
      campaignId={VHARN.id}
      isMaster={isMaster}
      live={live}
      presentations={api}
      store={store}
      submit={(intent) => commands.submit(intent)}
    />,
  );
  return { commands, api, store };
}

describe('image details', () => {
  it('showing a private image applies the confirmed presentation without publishing its library item', async () => {
    const { commands, api, store } = panel();
    api.answer = {
      ok: true,
      value: {
        campaignId: VHARN.id,
        version: 1,
        at: PORTRAIT.updatedAt,
        presentation: {
          id: 'P1',
          imageId: PORTRAIT.id,
          name: PORTRAIT.name,
          asset: PORTRAIT.asset,
        },
      },
    };
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar para todos' }));
    expect(api.calls).toEqual([{ method: 'present', campaignId: VHARN.id, imageId: PORTRAIT.id }]);
    expect(store.getState().presentation?.id).toBe('P1');
    expect(commands.sent).toEqual([]);
  });
  it('failed presentation shows the reason and refreshes the snapshot without repeating POST', async () => {
    const { api, store } = panel();
    api.answer = { ok: false, failure: { kind: 'offline' } };
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar para todos' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão');
    expect(api.calls.map(({ method }) => method)).toEqual(['present', 'snapshot']);
    expect(store.getState().presentation).toBeNull();
  });
  it('player preview is local and exposes no mutation or grid activation controls', async () => {
    const { api, commands } = panel(false);
    expect(screen.queryByRole('button', { name: 'Mostrar para todos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir imagem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Levar o grupo pra cá' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('dialog', { name: 'Retrato' })).toBeInTheDocument();
    expect(api.calls).toEqual([]);
    expect(commands.sent).toEqual([]);
  });
  it('reconnecting disables presentation and all edits', () => {
    panel(true, false);
    expect(screen.getByRole('button', { name: 'Mostrar para todos' })).toBeDisabled();
    expect(screen.getByLabelText('Nome da imagem')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir imagem' })).toBeDisabled();
  });
});
