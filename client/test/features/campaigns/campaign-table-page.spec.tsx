import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';

describe('campaign table page', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  function renderTable(): void {
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
  }

  it('names the campaign, says the board opens here and links back to the campaigns', async () => {
    renderTable();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(VHARN.name);
    expect(screen.getByText('O tabuleiro abre aqui.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para as mesas' })).toHaveAttribute('href', '/');
  });

  it('titles the page after the campaign', async () => {
    renderTable();
    await waitFor(() => expect(document.title).toBe(`Lorkarium · ${VHARN.name}`));
  });

  it('a campaign the user is not in reads "Mesa não encontrada." with the way back', async () => {
    deps.campaignsApi.answer('detail', { ok: false, failure: { kind: 'not_found' } });
    renderTable();
    expect(
      await screen.findByRole('heading', { name: 'Mesa não encontrada.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para as mesas' })).toHaveAttribute('href', '/');
  });
});
