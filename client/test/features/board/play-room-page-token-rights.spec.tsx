import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import {
  BIA_AT_TABLE,
  vharnBoard,
  vharnRenamed,
  vharnState,
} from '../../support/table-session-fixtures';

async function openRoomAsBia(playersCreateTokens: boolean): Promise<TestDependencies> {
  const deps = testDependencies();
  deps.authApi.answerMeWith(ANA);
  deps.campaignsApi.answer('detail', {
    ok: true,
    value: detailOf({ ...VHARN, myRole: 'player', playersCreateTokens }),
  });
  const router = createMemoryRouter(buildRoutes(deps), {
    initialEntries: [`/campaigns/${VHARN.id}/table`],
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1 });
  const viewer = { userId: BIA_AT_TABLE.userId, role: 'player' } as const;
  deps.tableSessionApi.emit(
    { kind: 'state', state: vharnState() },
    { kind: 'status', status: 'live' },
    { kind: 'board', state: vharnBoard({ viewer }) },
  );
  await act(() => Promise.resolve());
  return deps;
}

function keysChanged(deps: TestDependencies, create: boolean): void {
  const event = vharnRenamed();
  const campaign = { ...event.campaign, playersCreateTokens: create, playersDeleteTokens: false };
  act(() => deps.tableSessionApi.emit({ kind: 'campaignUpdated', event: { ...event, campaign } }));
}

const newToken = () => screen.queryByRole('button', { name: 'Novo token' });

describe('play room: the players’ token keys', () => {
  it('Bia sees "Novo token" when the campaign opened with the create key', async () => {
    await openRoomAsBia(true);

    expect(newToken()).not.toBeNull();
  });

  it('the master turning the create key off takes "Novo token" away without an F5', async () => {
    const deps = await openRoomAsBia(true);

    keysChanged(deps, false);

    expect(newToken()).toBeNull();
  });

  it('the master turning the create key on gives Bia "Novo token" without an F5', async () => {
    const deps = await openRoomAsBia(false);
    expect(newToken()).toBeNull();

    keysChanged(deps, true);

    expect(newToken()).not.toBeNull();
  });

  it('Bia’s "Novo token" opens the dialog in her mode: no "Visão e luz", her locked in control', async () => {
    await openRoomAsBia(true);

    await userEvent.click(screen.getByRole('button', { name: 'Novo token' }));

    const dialog = screen.getByRole('dialog', { name: 'Novo token' });
    expect(dialog).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Visão e luz' })).toBeNull();
  });
});
