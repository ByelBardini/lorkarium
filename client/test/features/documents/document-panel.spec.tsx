import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { testDependencies } from '../../support/app-dependencies';
import { openLibrary } from '../../support/library-harness';
import { vharnLibrary } from '../../support/library-fixtures';
import { documentFixture } from '../../support/documents-fixtures';
import { VHARN } from '../../support/campaigns-api-fake';
import { ChatWindowHostFake } from '../../support/chat-window-host-fake';

async function openDocument(changes: Parameters<typeof documentFixture>[0] = {}) {
  const deps = testDependencies();
  deps.documentsApi.document = documentFixture(changes);
  deps.libraryApi.answer('list', {
    ok: true,
    value: vharnLibrary({ documents: [deps.documentsApi.document] }),
  });
  const room = await openLibrary(deps);
  await userEvent.click(screen.getByRole('treeitem', { name: 'Carta' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Expandir documento' }));
  await screen.findByRole('textbox', { name: 'Nome do documento' });
  await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
  return { deps, ...room };
}
describe('authorized document panel', () => {
  it('keeps a blocked preview popup available in the room tab with a clear retry message', async () => {
    const deps = testDependencies();
    deps.chatWindowHost = new ChatWindowHostFake(true);
    deps.documentsApi.document = documentFixture();
    deps.libraryApi.answer('list', {
      ok: true,
      value: vharnLibrary({ documents: [deps.documentsApi.document] }),
    });
    const { router } = await openLibrary(deps);
    await userEvent.click(screen.getByRole('treeitem', { name: 'Carta' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Abrir documento em outra janela' }),
    );
    await screen.findByRole('textbox', { name: 'Nome do documento' });
    expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`);
    expect(screen.getByRole('alert')).toHaveTextContent('Permita janelas pop-up');
    expect(await screen.findByRole('tab', { name: 'Carta' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(deps.documentWorkspace.getState().entries).toHaveLength(1);
  });
  it('closes its document tab and returns to the campaign table', async () => {
    const { deps, router } = await openDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar documento' }));
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`);
    expect(deps.documentWorkspace.getState().entries).toEqual([]);
  });
  it('lets an owner edit the title without master controls', async () => {
    const { deps } = await openDocument({ canManage: false, ownerIds: undefined });
    expect(screen.queryByText('Visível para todos na mesa')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir documento' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome do documento' }), {
      target: { value: 'Carta revista' },
    });
    await act(async () => {
      deps.interactionClock.advance(1000);
    });
    expect(deps.documentsApi.saves[0]?.name).toBe('Carta revista');
  });
  it('renders a public reader without an editing toolbar', async () => {
    await openDocument({
      canManage: false,
      canEdit: false,
      visibility: 'public',
      ownerIds: undefined,
    });
    expect(screen.getByRole('textbox', { name: 'Nome do documento' })).toBeDisabled();
    await screen.findByRole('document', { name: 'Conteúdo do documento' });
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
  it('unmounts private content and images when invalidation revokes reading', async () => {
    const { deps, table } = await openDocument();
    await screen.findByRole('textbox', { name: 'Conteúdo do documento' });
    deps.documentsApi.detailResult = { ok: false, failure: { kind: 'not_found' } };
    await act(async () => {
      table.tabs.setState({ libraryRevision: 1 });
    });
    await waitFor(() => expect(deps.documentWorkspace.getState().entries).toEqual([]));
    expect(
      screen.queryByRole('textbox', { name: 'Conteúdo do documento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).not.toBeInTheDocument();
  });
  it('asks whether to keep editing or discard when closing an offline draft', async () => {
    const { deps } = await openDocument();
    deps.documentsApi.saveResult = { ok: false, failure: { kind: 'offline' } };
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome do documento' }), {
      target: { value: 'Rascunho offline' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Fechar documento' }));
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByRole('textbox', { name: 'Nome do documento' })).toHaveValue(
      'Rascunho offline',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fechar documento' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar alterações' }));
    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: 'Carta' })).not.toBeInTheDocument(),
    );
  });
});
