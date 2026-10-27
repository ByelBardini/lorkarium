import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { CampaignSettingsHarness } from '../../support/campaign-settings-harness';

describe('campaign settings · "Permissões dos jogadores"', () => {
  let deps: TestDependencies;
  let harness: CampaignSettingsHarness;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    harness = new CampaignSettingsHarness(deps);
  });

  function section(): HTMLElement {
    return screen.getByRole('region', { name: 'Permissões dos jogadores' });
  }

  it('shows both switches at the confirmed rights, with the hint', async () => {
    await harness.open({ playersCreateTokens: true, playersDeleteTokens: false });
    const create = within(section()).getByRole('switch', {
      name: 'Jogadores criam e editam tokens',
    });
    const remove = within(section()).getByRole('switch', {
      name: 'Jogadores excluem os próprios tokens',
    });
    expect(create).toBeChecked();
    expect(remove).not.toBeChecked();
    expect(section()).toHaveTextContent(
      'Valem para todo jogador; espectador nunca cria nem exclui.',
    );
  });

  it('switching one on and saving sends the PATCH only with it', async () => {
    await harness.open();
    deps.campaignsApi.answer('update', {
      ok: true,
      value: detailOf(VHARN, { playersDeleteTokens: true }),
    });
    const remove = within(section()).getByRole('switch', {
      name: 'Jogadores excluem os próprios tokens',
    });

    await userEvent.click(remove);
    await harness.save();

    await waitFor(() => expect(harness.lastUpdateInput()).toEqual({ playersDeleteTokens: true }));
  });

  it('the side menu jumps to it as "Permissões"', async () => {
    await harness.open();
    const menu = screen.getByRole('navigation', { name: 'Seções das configurações' });
    await userEvent.click(within(menu).getByRole('button', { name: 'Permissões' }));
    expect(section()).toHaveFocus();
  });
});
