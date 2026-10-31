import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDependencies } from '@/app/router';
import { DocumentWorkspaceHost } from '@/features/documents/document-workspace-host';
import { SheetPanel } from '@/features/sheets/sheet-panel';
import { SHEET_READY_TIMEOUT_MS } from '@/features/sheets/sheet-sandbox-view';
import { boardTokenSource, type BoardTokenSource } from '@/sheet-sandbox/sheet-token-source';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createSheetStore, type SheetStoreState } from '@/stores/sheet-store';
import { testDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { LYRA_ANCHOR_ID, VHARN_CAST_ID, castBoard, lyraAnchor } from '../../support/cast-fixtures';
import { DiceCommandsFake } from '../../support/dice-commands-fake';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { SheetCommandsFake } from '../../support/sheet-commands-fake';
import { LYRA_SHEET_ID, lyraSheet, sheetResponse } from '../../support/sheet-fixtures';
import { SheetChannelsFake } from '../../support/sheet-frame-fakes';
import { SheetsApiFake } from '../../support/sheets-api-fake';
import { vharnBoard, vharnState } from '../../support/table-session-fixtures';

const TITLE = 'Ficha · Lyra de Vharn';

describe('SheetPanel', () => {
  let api: SheetsApiFake;
  let clock: InteractionClockFake;
  let channels: SheetChannelsFake;
  let cast: StoreApi<BoardStore>;
  let store: StoreApi<SheetStoreState>;

  beforeEach(async () => {
    api = new SheetsApiFake();
    clock = new InteractionClockFake();
    channels = new SheetChannelsFake();
    cast = createBoardStore(VHARN.id, () => undefined);
    cast.getState().apply({ kind: 'board', state: castBoard() });
  });

  async function renderLyra(
    tokens: BoardTokenSource | null = boardTokenSource(cast, LYRA_ANCHOR_ID),
  ): Promise<void> {
    store = createSheetStore({
      ...{ api, campaignId: VHARN.id, sheetId: LYRA_SHEET_ID, clock },
      newActionId: () => '00000000-0000-4000-8000-000000000001',
    });
    await store.getState().load();
    const services = {
      sheetsApi: api,
      sheetCommands: new SheetCommandsFake(),
      dice: new DiceCommandsFake(),
      clock,
    };
    render(
      <SheetPanel
        campaignId={VHARN.id}
        title={TITLE}
        store={store}
        tokens={tokens}
        services={services}
        createChannel={channels.create}
      />,
    );
  }

  function loadFrame(): HTMLIFrameElement {
    const frame = screen.getByTitle(TITLE) as HTMLIFrameElement;
    vi.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
    fireEvent.load(frame);
    return frame;
  }

  function frameSaysReady(): void {
    const port = channels.created.at(-1)?.port1;
    if (!port) throw new Error(`no channel was opened; channels: ${channels.created.length}`);
    act(() => {
      port.dispatchEvent(new MessageEvent('message', { data: { type: 'ready', requestId: '1' } }));
    });
  }

  it('frames the sheet with its template and whose code it is, editable for a controller', async () => {
    await renderLyra();
    const region = screen.getByRole('region', { name: TITLE });
    expect(within(region).getByRole('heading', { name: 'Ficha Tormenta' })).toBeInTheDocument();
    expect(within(region).getByText('Ficha da mesa · código do mestre')).toBeInTheDocument();
    expect(within(region).queryByText('Somente leitura')).not.toBeInTheDocument();
    expect(within(region).getByTitle(TITLE)).toHaveAttribute('sandbox', 'allow-scripts');
  });

  it('a `table` sheet read by someone who may not edit it is marked "Somente leitura"', async () => {
    api.response = sheetResponse(lyraSheet({ visibility: 'table', canEdit: false }));
    await renderLyra();
    expect(screen.getByText('Somente leitura')).toBeInTheDocument();
  });

  it('no `ready` in 5 s says "A ficha não respondeu", and "Recarregar" makes a new frame', async () => {
    await renderLyra();
    const first = loadFrame();
    act(() => clock.advance(SHEET_READY_TIMEOUT_MS - 1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    act(() => clock.advance(1));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('A ficha não respondeu');
    fireEvent.click(within(alert).getByRole('button', { name: 'Recarregar' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTitle(TITLE)).not.toBe(first);
    expect(channels.created[0]?.port1.closed).toBe(true);
  });

  it('a frame that says `ready` in time is left alone', async () => {
    await renderLyra();
    loadFrame();
    frameSaysReady();
    act(() => clock.advance(SHEET_READY_TIMEOUT_MS * 2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(channels.created[0]?.port1.sent).toContainEqual(
      expect.objectContaining({ type: 'state' }),
    );
  });

  it('a second `load` leaves only "Ficha recarregada", and "Recarregar" brings the frame back', async () => {
    await renderLyra();
    const frame = loadFrame();
    fireEvent.load(frame);
    expect(screen.queryByTitle(TITLE)).not.toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Ficha recarregada');
    act(() => clock.advance(SHEET_READY_TIMEOUT_MS));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    fireEvent.click(within(alert).getByRole('button', { name: 'Recarregar' }));
    expect(screen.getByTitle(TITLE)).toBeInTheDocument();
  });

  it('a sheet nobody holds gives the frame a state with no token and no bars', async () => {
    api.response = sheetResponse(lyraSheet({ tokenId: null, memberId: null }));
    await renderLyra(null);
    loadFrame();
    frameSaysReady();
    await waitFor(() =>
      expect(channels.created[0]?.port1.sent).toContainEqual(
        expect.objectContaining({ type: 'state', token: null, bars: [] }),
      ),
    );
  });

  it('a held sheet whose token is not in the room yet sends no state (still loading)', async () => {
    await renderLyra(null);
    loadFrame();
    frameSaysReady();
    await act(async () => undefined);
    const sent = channels.created[0]?.port1.sent ?? [];
    expect(sent.filter((message) => (message as { type?: string }).type === 'state')).toEqual([]);
  });

  it('a sheet given to a holder while open gets a new frame on the new holder', async () => {
    api.response = sheetResponse(lyraSheet({ tokenId: null, memberId: null }));
    await renderLyra();
    const first = loadFrame();
    api.response = sheetResponse(lyraSheet({ version: 2 }));
    await act(() => store.getState().load());
    const second = screen.getByTitle(TITLE);
    expect(second).not.toBe(first);
    expect(channels.created[0]?.port1.closed).toBe(true);
    loadFrame();
    frameSaysReady();
    await waitFor(() =>
      expect(channels.created[1]?.port1.sent).toContainEqual(
        expect.objectContaining({
          type: 'state',
          token: expect.objectContaining({ name: 'Lyra' }),
        }),
      ),
    );
  });

  it('losing the control of the token reads the sheet again from the server', async () => {
    await renderLyra();
    const reads = api.detailCalls;
    api.detailResult = { ok: false, failure: { kind: 'not_found' } };
    act(() =>
      cast.getState().apply({
        kind: 'board',
        state: castBoard({ version: 4, tokens: [lyraAnchor({ canControl: false })] }),
      }),
    );
    await waitFor(() => expect(store.getState().status).toBe('not_found'));
    expect(api.detailCalls).toBe(reads + 1);
  });

  function frameLogs(...messages: unknown[]): void {
    loadFrame();
    const port = channels.created.at(-1)?.port1;
    if (!port) throw new Error(`no channel was opened; channels: ${channels.created.length}`);
    act(() => {
      for (const data of messages) port.dispatchEvent(new MessageEvent('message', { data }));
    });
  }

  const ERROR_LINE = { type: 'console', level: 'error', message: 'pv is not defined', at: [] };

  it('the master sees the frame’s errors in a mark of the frame that opens its console', async () => {
    api.response = sheetResponse(lyraSheet({ canManage: true }));
    await renderLyra();
    expect(screen.getByRole('button', { name: 'Console da ficha · Sem erros' })).toBeVisible();
    frameLogs(ERROR_LINE, { type: 'console', level: 'log', message: 'Força 14', at: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Console da ficha · 1 erro' }));
    const panel = await screen.findByRole('dialog', { name: 'Console da ficha' });
    expect(within(panel).getByText('pv is not defined')).toBeInTheDocument();
    expect(within(panel).getByText('Força 14')).toBeInTheDocument();
  });

  it('a player sees no console mark, and the frame’s lines go nowhere', async () => {
    await renderLyra();
    frameLogs(ERROR_LINE);
    expect(screen.queryByRole('button', { name: /Console da ficha/ })).toBeNull();
    expect(channels.created[0]?.port1.sent).toEqual([]);
    // Made master while the frame runs: what the frame said as a player was never kept.
    api.response = sheetResponse(lyraSheet({ version: 2, canManage: true }));
    await act(() => store.getState().load());
    expect(screen.getByRole('button', { name: 'Console da ficha · Sem erros' })).toBeVisible();
  });
});

describe('a sheet in the room', () => {
  async function roomWithLyraSheet() {
    const deps = testDependencies();
    deps.sessionStore.getState().signedIn(ANA);
    deps.openTables.getState().restore(ANA.id);
    deps.openTables
      .getState()
      .open({ campaignId: VHARN.id, name: VHARN.name, castSceneId: VHARN_CAST_ID });
    deps.tableSessionApi.emitTo(
      VHARN.id,
      { kind: 'state', state: vharnState() },
      { kind: 'board', state: vharnBoard() },
    );
    deps.tableSessionApi.emitToCast(VHARN.id, { kind: 'board', state: castBoard() });
    deps.documentWorkspace
      .getState()
      .openSheet({ campaign: detailOf(VHARN), sheetId: LYRA_SHEET_ID, sheetName: 'Lyra de Vharn' });
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
            { path: 'campaigns/:campaignId/table', element: <SheetTabTarget deps={deps} /> },
          ],
        },
      ],
      { initialEntries: [`/campaigns/${VHARN.id}/table`] },
    );
    render(<RouterProvider router={router} />);
    await screen.findByTitle(TITLE);
    return deps;
  }

  it('the window makes a new frame and reads the values again from the server', async () => {
    const deps = await roomWithLyraSheet();
    const inTab = screen.getByTitle(TITLE);
    const reads = deps.sheetsApi.detailCalls;
    deps.sheetsApi.response = sheetResponse(lyraSheet({ version: 2, values: { forca: 18 } }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha em janela' }));
    const popup = deps.chatWindowHost.last();
    expect(deps.chatWindowHost.calls[0]?.url).toBe('/chat-window.html?panel=sheet');
    popup.load();
    const body = within(popup.document.body);
    const inWindow = await body.findByTitle(TITLE);
    expect(inWindow).not.toBe(inTab);
    expect(screen.getByText('Ficha aberta em outra janela.')).toBeInTheDocument();
    await waitFor(() => expect(deps.sheetsApi.detailCalls).toBeGreaterThan(reads));
    const store = deps.documentWorkspace.getState().sheets[0]!.store;
    await waitFor(() => expect(store.getState().values).toEqual({ forca: 18 }));
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('the master taking Bia off the token closes its `controllers` sheet and says so', async () => {
    const deps = await roomWithLyraSheet();
    deps.sheetsApi.detailResult = { ok: false, failure: { kind: 'not_found' } };
    deps.tableSessionApi.emitToCast(VHARN.id, {
      kind: 'board',
      state: castBoard({ version: 4, tokens: [lyraAnchor({ canControl: false })] }),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A ficha Lyra de Vharn foi fechada: ela foi excluída ou você não pode mais vê-la.',
    );
    expect(screen.queryByTitle(TITLE)).not.toBeInTheDocument();
    expect(deps.documentWorkspace.getState().sheets).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sheet:changed of the table reads a newer version of the open sheet', async () => {
    const deps = await roomWithLyraSheet();
    const reads = deps.sheetsApi.detailCalls;
    deps.sheetsApi.response = sheetResponse(lyraSheet({ version: 3, values: { forca: 20 } }));
    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'sheetChanged',
      event: {
        campaignId: VHARN.id,
        sheetId: LYRA_SHEET_ID,
        version: 3,
        at: '2026-10-31T12:00:00.000Z',
      },
    });
    const store = deps.documentWorkspace.getState().sheets[0]!.store;
    await waitFor(() => expect(store.getState().values).toEqual({ forca: 20 }));
    expect(deps.sheetsApi.detailCalls).toBe(reads + 1);
    act(() => deps.documentWorkspace.getState().clear());
  });
});

function SheetTabTarget({ deps }: Readonly<{ deps: AppDependencies }>): React.JSX.Element {
  const key = useStore(deps.documentWorkspace, (state) => state.activeByCampaign[VHARN.id] ?? null);
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!key) return;
    deps.documentWorkspace.getState().setTarget(key, target.current);
    return () => deps.documentWorkspace.getState().setTarget(key, null);
  }, [deps.documentWorkspace, key]);
  return <div ref={target} />;
}
