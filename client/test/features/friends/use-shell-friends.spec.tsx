import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { createPresenceChoiceStore } from '@/stores/presence-choice-store';
import {
  PRESENCE_ACTION_ID,
  testDependencies,
  type TestDependencies,
} from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';

describe('the status in the user menu of the shell', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    deps.accountRealtime.start();
  });

  async function chooseInvisible(): Promise<void> {
    const nav = await screen.findByRole('complementary', { name: 'Menu lateral' });
    await userEvent.click(nav.querySelector('button[aria-haspopup="menu"]') as HTMLElement);
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Invisível' }));
  }

  function setVisibilitySent(): unknown[] {
    return deps.accountTransport.sent
      .filter((message) => message.event === 'presence:setVisibility')
      .map((message) => message.payload);
  }

  it('"Invisível" goes to the server at once while connected', async () => {
    deps.accountTransport.lifecycle({ kind: 'connected' });
    render(<RouterProvider router={createMemoryRouter(buildRoutes(deps))} />);
    await chooseInvisible();
    expect(setVisibilitySent()).toEqual([
      { actionId: PRESENCE_ACTION_ID, visibility: 'online' },
      { actionId: PRESENCE_ACTION_ID, visibility: 'invisible' },
    ]);
  });

  it('without connection the choice stays here and goes at the next connection', async () => {
    render(<RouterProvider router={createMemoryRouter(buildRoutes(deps))} />);
    await chooseInvisible();
    expect(setVisibilitySent()).toEqual([]);
    deps.accountTransport.lifecycle({ kind: 'connected' });
    expect(setVisibilitySent()).toEqual([
      { actionId: PRESENCE_ACTION_ID, visibility: 'invisible' },
    ]);
  });

  it('the choice survives a reload of the page', async () => {
    render(<RouterProvider router={createMemoryRouter(buildRoutes(deps))} />);
    await chooseInvisible();
    expect(createPresenceChoiceStore(deps.presenceChoiceStorage).getState().choice).toBe(
      'invisible',
    );
  });
});
