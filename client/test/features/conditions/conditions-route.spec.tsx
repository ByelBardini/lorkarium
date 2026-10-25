import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, QUELM, VHARN } from '../../support/campaigns-api-fake';
import { vharnBoard, vharnState } from '../../support/table-session-fixtures';

const ROOM_PATH = `/campaigns/${VHARN.id}/table`;
const CONDITIONS_URL = `${ROOM_PATH}/conditions`;

describe('conditions route', () => {
  let deps: TestDependencies;
  let router: ReturnType<typeof createMemoryRouter>;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  function renderAt(path: string): void {
    router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
  }

  // VHARN's room, live, as the master (Ana).
  async function openRoom(): Promise<void> {
    deps.campaignsApi.answer('detail', { ok: true, value: detailOf(VHARN) });
    renderAt(ROOM_PATH);
    await screen.findByRole('heading', { level: 1, name: VHARN.name });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard() },
    );
    await act(() => Promise.resolve());
  }

  async function openConditionsPage(): Promise<HTMLElement> {
    await openRoom();
    await userEvent.click(screen.getByRole('link', { name: 'Condições' }));
    return screen.findByRole('heading', { level: 1, name: 'Condições da mesa' });
  }

  it('the room header has "Condições" for the master, pointing at the conditions page', async () => {
    await openRoom();
    expect(screen.getByRole('link', { name: 'Condições' })).toHaveAttribute('href', CONDITIONS_URL);
  });

  it('the master following "Condições" lands on "Condições da mesa" with "Voltar à mesa"', async () => {
    await openConditionsPage();
    expect(router.state.location.pathname).toBe(CONDITIONS_URL);
    expect(screen.getByRole('link', { name: 'Voltar à mesa' })).toHaveAttribute('href', ROOM_PATH);
  });

  it('the room stays mounted under the page but invisible', async () => {
    await openConditionsPage();
    expect(screen.getByRole('application').closest('.invisible')).not.toBeNull();
  });

  it('the image field of the sheet sends to the assets of the app, for this table, as a condition image', async () => {
    await openConditionsPage();
    deps.tableSessionApi.emitToCast(VHARN.id, { kind: 'board', state: vharnBoard() });
    await userEvent.click(screen.getByRole('button', { name: 'Nova condição' }));
    const png = new File([new Uint8Array(64)], 'cego.png', { type: 'image/png' });
    await userEvent.upload(await screen.findByLabelText('Arquivo de imagem'), png);
    expect(deps.assets.sent).toEqual([
      { kind: 'upload', campaignId: VHARN.id, file: png, purpose: 'condition' },
    ]);
  });

  it('a player has no "Condições" link, and the URL takes them back to the room', async () => {
    deps.campaignsApi.answer('detail', { ok: true, value: detailOf(QUELM) });
    renderAt(`/campaigns/${QUELM.id}/table/conditions`);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/campaigns/${QUELM.id}/table`),
    );
    await screen.findByRole('heading', { level: 1, name: QUELM.name });
    expect(screen.queryByRole('link', { name: 'Condições' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: 'Condições da mesa' })).toBeNull();
  });
});
