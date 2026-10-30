import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RoomImagePresentation } from '@/features/library/room-image-presentation';
import { createImagePresentationStore } from '@/stores/image-presentation-store';
import { PORTRAIT } from '../../support/library-fixtures';
import { VHARN } from '../../support/campaigns-api-fake';
import { StorageFake } from '../../support/storage-fake';
import { ChatWindowHostFake } from '../../support/chat-window-host-fake';

function presentation(id = 'P1', version = 1) {
  return {
    campaignId: VHARN.id,
    version,
    at: '2026-10-29T12:00:00.000Z',
    presentation: { id, imageId: PORTRAIT.id, name: PORTRAIT.name, asset: PORTRAIT.asset },
  };
}
function mounted() {
  const store = createImagePresentationStore({
    campaignId: VHARN.id,
    userId: 'ana',
    storage: new StorageFake(),
  });
  const host = new ChatWindowHostFake();
  const view = render(<RoomImagePresentation store={store} host={host} isDesktop={false} />);
  return { store, host, view };
}

describe('room image presentation', () => {
  it('leaving the room suppresses presentations received while away and returning stays quiet', () => {
    const { store, host, view } = mounted();
    act(() => store.getState().apply(presentation()));
    view.unmount();
    act(() => store.getState().apply(presentation('P2', 2)));
    render(<RoomImagePresentation store={store} host={host} isDesktop={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => store.getState().apply(presentation('P3', 3)));
    expect(screen.getByRole('dialog', { name: 'Retrato' })).toBeInTheDocument();
  });
  it('a remote presentation opens without a library or local gesture and never requests a browser popup', () => {
    const { store, host } = mounted();
    act(() => store.getState().apply(presentation()));
    expect(screen.getByRole('dialog', { name: 'Retrato' })).toBeInTheDocument();
    expect(host.calls).toEqual([]);
  });
  it('closing P1 dismisses only this viewer and a duplicate does not reopen it', async () => {
    const { store } = mounted();
    act(() => store.getState().apply(presentation()));
    await userEvent.click(screen.getByRole('button', { name: 'Fechar imagem' }));
    expect(store.getState().presentation?.id).toBe('P1');
    expect(store.getState().dismissed).toBe(true);
    act(() => store.getState().apply(presentation()));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('a new show of the same image reopens and substitution keeps a single modal', async () => {
    const { store } = mounted();
    act(() => store.getState().apply(presentation()));
    await userEvent.click(screen.getByRole('button', { name: 'Fechar imagem' }));
    act(() => store.getState().apply(presentation('P2', 2)));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    act(() =>
      store.getState().apply({
        ...presentation('P3', 3),
        presentation: { ...presentation().presentation, name: 'Paisagem', id: 'P3' },
      }),
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Paisagem' })).toBeInTheDocument();
  });
  it('foreign campaign state is ignored and deletion clears the visible content', () => {
    const { store } = mounted();
    act(() => store.getState().apply({ ...presentation(), campaignId: 'other' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => store.getState().apply(presentation()));
    act(() => store.getState().apply({ ...presentation('P2', 2), presentation: null }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
