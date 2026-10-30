import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { describe, expect, it } from 'vitest';
import { DocumentWorkspaceHost } from '@/features/documents/document-workspace-host';
import type { AppDependencies } from '@/app/router';
import { testDependencies } from '../../support/app-dependencies';
import { documentFixture } from '../../support/documents-fixtures';
import { vharnLibrary } from '../../support/library-fixtures';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { ANA } from '../../support/auth-api-fake';

async function workspaceScreen() {
  const deps = testDependencies();
  deps.sessionStore.getState().signedIn(ANA);
  deps.openTables.getState().restore(ANA.id);
  deps.documentsApi.document = documentFixture();
  deps.libraryApi.answer('list', {
    ok: true,
    value: vharnLibrary({ documents: [deps.documentsApi.document] }),
  });
  deps.documentWorkspace
    .getState()
    .open({ campaign: detailOf(VHARN), document: deps.documentsApi.document });
  const path = `/campaigns/${VHARN.id}/table`;
  const router = createMemoryRouter(
    [
      {
        Component: () => (
          <>
            <DocumentWorkspaceHost deps={deps} />
            <Outlet />
          </>
        ),
        children: [
          { path: '/', element: <h1>Mesas</h1> },
          { path: 'campaigns/:campaignId/table', element: <DocumentTabTarget deps={deps} /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByRole('textbox', { name: 'Nome do documento' });
  await act(async () => deps.tableSessionApi.emit({ kind: 'status', status: 'live' }));
  return { deps, router, path };
}

function DocumentTabTarget({ deps }: Readonly<{ deps: AppDependencies }>): React.JSX.Element {
  const key = useStore(deps.documentWorkspace, (state) => state.activeByCampaign[VHARN.id] ?? null);
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!key) return;
    deps.documentWorkspace.getState().setTarget(key, target.current);
    return () => deps.documentWorkspace.getState().setTarget(key, null);
  }, [deps.documentWorkspace, key]);
  return (
    <main>
      <h1>Sala</h1>
      <div ref={target} />
    </main>
  );
}
describe('persistent document workspace host', () => {
  it('keeps one dirty editor when leaving its route and returning from another screen', async () => {
    const { deps, router, path } = await workspaceScreen();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome do documento' }), {
      target: { value: 'Rascunho guardado' },
    });
    const editor = deps.documentWorkspace.getState().entries[0]?.editor;
    await act(async () => {
      await router.navigate('/');
    });
    expect(screen.getByRole('heading', { name: 'Mesas' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).not.toBeInTheDocument();
    await act(async () => {
      await router.navigate(path);
    });
    expect(await screen.findByRole('textbox', { name: 'Nome do documento' })).toHaveValue(
      'Rascunho guardado',
    );
    expect(deps.documentWorkspace.getState().entries[0]?.editor).toBe(editor);
    act(() => deps.documentWorkspace.getState().clear());
  });
  it('keeps detached content through navigation and returns it to the document tab after native close', async () => {
    const { deps, router, path } = await workspaceScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir documento em janela' }));
    expect(deps.chatWindowHost.calls).toHaveLength(1);
    const popup = deps.chatWindowHost.last();
    popup.load();
    await waitFor(() =>
      expect(
        within(popup.document.body).getByRole('textbox', { name: 'Nome do documento' }),
      ).toHaveValue('Carta'),
    );
    expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).not.toBeInTheDocument();
    await act(async () => {
      await router.navigate('/');
    });
    expect(popup.closed).toBe(false);
    expect(
      within(popup.document.body).getByRole('textbox', { name: 'Nome do documento' }),
    ).toHaveValue('Carta');
    popup.closeByUser();
    await act(async () => {
      await router.navigate(path);
    });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Nome do documento' })).toHaveValue('Carta'),
    );
    expect(deps.documentWorkspace.getState().entries).toHaveLength(1);
    act(() => deps.documentWorkspace.getState().clear());
  });
  it('puts the window options in the title bar and drops the tab-only controls from the detached document', async () => {
    const { deps } = await workspaceScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir documento em janela' }));
    const popup = deps.chatWindowHost.last();
    popup.load();
    const body = within(popup.document.body);
    await waitFor(() =>
      expect(body.getByRole('textbox', { name: 'Nome do documento' })).toHaveValue('Carta'),
    );
    const titleBar = within(body.getByRole('banner', { name: 'Barra da janela' }));
    expect(titleBar.getByRole('button', { name: 'Sempre por cima' })).toBeInTheDocument();
    expect(titleBar.getByRole('button', { name: 'Voltar para a aba' })).toBeInTheDocument();
    expect(body.queryByRole('checkbox', { name: 'Sempre por cima' })).not.toBeInTheDocument();
    expect(body.queryByRole('button', { name: 'Fechar documento' })).not.toBeInTheDocument();
    expect(body.queryByText('Documento')).not.toBeInTheDocument();
    act(() => deps.documentWorkspace.getState().clear());
  });
  it('closes the detached editor and clears its text when its table is explicitly closed', async () => {
    const { deps } = await workspaceScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir documento em janela' }));
    const popup = deps.chatWindowHost.last();
    popup.load();
    await waitFor(() =>
      expect(
        within(popup.document.body).getByRole('textbox', { name: 'Nome do documento' }),
      ).toHaveValue('Carta'),
    );
    act(() => deps.openTables.getState().close(VHARN.id));
    await waitFor(() => expect(deps.documentWorkspace.getState().entries).toEqual([]));
    expect(popup.closed).toBe(true);
  });
  it('returns a preview popup to its own room tab even while another screen is shown', async () => {
    const { deps, router, path } = await workspaceScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir documento em janela' }));
    const popup = deps.chatWindowHost.last();
    popup.load();
    await waitFor(() =>
      expect(
        within(popup.document.body).getByRole('textbox', { name: 'Nome do documento' }),
      ).toHaveValue('Carta'),
    );
    const key = deps.documentWorkspace.getState().entries[0]!.key;
    await act(async () => {
      deps.documentWorkspace.getState().activate(VHARN.id, null);
      await router.navigate('/');
    });
    fireEvent.click(within(popup.document.body).getByRole('button', { name: 'Voltar para a aba' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(path));
    expect(deps.documentWorkspace.getState().activeByCampaign[VHARN.id]).toBe(key);
    expect(await screen.findByRole('textbox', { name: 'Nome do documento' })).toHaveValue('Carta');
    expect(popup.closed).toBe(true);
    act(() => deps.documentWorkspace.getState().clear());
  });
  it('role invalidation removes private detached text and closes its window', async () => {
    const { deps } = await workspaceScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir documento em janela' }));
    const popup = deps.chatWindowHost.last();
    popup.load();
    await waitFor(() =>
      expect(
        within(popup.document.body).getByRole('textbox', { name: 'Nome do documento' }),
      ).toHaveValue('Carta'),
    );
    deps.documentsApi.detailResult = { ok: false, failure: { kind: 'not_found' } };
    const table = deps.openTables.getState().tables[0];
    act(() => table?.tabs.setState({ libraryRevision: 1 }));
    await waitFor(() => expect(deps.documentWorkspace.getState().entries).toEqual([]));
    expect(popup.closed).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).not.toBeInTheDocument();
  });
});
