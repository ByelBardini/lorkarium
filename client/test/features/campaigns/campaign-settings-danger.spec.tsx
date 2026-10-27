import type { AuthUserDto } from '@lorkarium/contracts';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA, ROOT_ADMIN } from '../../support/auth-api-fake';
import { CampaignSettingsHarness } from '../../support/campaign-settings-harness';
import { BIA_AT_TABLE } from '../../support/table-session-fixtures';

const BIA: AuthUserDto = { ...ANA, id: BIA_AT_TABLE.userId, username: 'bia', name: 'Bia' };

describe('campaign settings · "Excluir mesa" only with owner powers', () => {
  let deps: TestDependencies;
  let harness: CampaignSettingsHarness;

  beforeEach(() => {
    deps = testDependencies();
    harness = new CampaignSettingsHarness(deps);
  });

  const deleteButton = (form: HTMLElement) =>
    within(form).queryByRole('button', { name: 'Excluir mesa' });
  const dangerLink = () => screen.queryByRole('button', { name: 'Zona de perigo' });

  it('Ana the owner sees "Excluir mesa" and its place in the section menu', async () => {
    deps.authApi.answerMeWith(ANA);

    const form = await harness.open();

    expect(deleteButton(form)).toBeInTheDocument();
    expect(dangerLink()).toBeInTheDocument();
  });

  it('Bia the co-master keeps the settings but not "Excluir mesa"', async () => {
    deps.authApi.answerMeWith(BIA);

    const form = await harness.open();

    expect(within(form).getByLabelText('Nome da mesa')).toBeInTheDocument();
    expect(deleteButton(form)).toBeNull();
    expect(dangerLink()).toBeNull();
  });

  it('Root the juggernaut sees "Excluir mesa"', async () => {
    deps.authApi.answerMeWith(ROOT_ADMIN);

    const form = await harness.open({ juggernaut: true });

    expect(deleteButton(form)).toBeInTheDocument();
  });
});
