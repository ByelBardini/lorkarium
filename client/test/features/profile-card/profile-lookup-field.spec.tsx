import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProfileCardHarness } from '../../support/profile-card-harness';
import { ANA_CARD, BIA_CARD, LYRA_CARD } from '../../support/profile-card-fixtures';

describe('profile lookup by @ in the full profile', () => {
  let harness: ProfileCardHarness;

  beforeEach(() => {
    harness = new ProfileCardHarness();
    harness.deps.profileCardApi.put(BIA_CARD).put(ANA_CARD);
  });

  async function openFullProfile(): Promise<HTMLElement> {
    await harness.open();
    await userEvent.click(screen.getByRole('button', { name: 'Ver perfil completo' }));
    return screen.findByRole('dialog', { name: 'Perfil completo de Lyra Valen' });
  }

  function lookupField(): HTMLElement {
    const search = screen.getByRole('search', { name: 'Buscar perfil' });
    return within(search).getByRole('searchbox', { name: 'Buscar @usuário' });
  }

  async function lookUp(typed: string): Promise<void> {
    await userEvent.clear(lookupField());
    await userEvent.type(lookupField(), `${typed}{Enter}`);
  }

  function lookups(): unknown[] {
    return harness.deps.profileCardApi.answers.callsOf('cardByUsername');
  }

  it('typing "Bia" and Enter turns the modal into Bia’s profile, and the field reads "bia"', async () => {
    await openFullProfile();

    await lookUp('Bia');

    const full = await screen.findByRole('dialog', { name: 'Perfil completo de Bia' });
    expect(within(full).getByText('@bia')).toBeInTheDocument();
    expect(full).not.toHaveTextContent('@lyravalen');
    expect(lookupField()).toHaveValue('bia');
  });

  it('"@BIA" finds the same account', async () => {
    await openFullProfile();

    await lookUp('@BIA');

    expect(await screen.findByRole('dialog', { name: 'Perfil completo de Bia' })).toBeVisible();
    expect(lookups()).toEqual(['bia']);
  });

  it('looking up one’s own @ shows one’s own card, without actions', async () => {
    await openFullProfile();

    await lookUp(ANA_CARD.username);

    const full = await screen.findByRole('dialog', { name: `Perfil completo de ${ANA_CARD.name}` });
    expect(within(full).queryByRole('button', { name: 'Mais ações' })).toBeNull();
    expect(within(full).getByRole('img', { name: /^Aprovações/ })).toBeInTheDocument();
  });

  it('looking up the @ already open makes no new request', async () => {
    await openFullProfile();

    await lookUp('@LyraValen');

    expect(lookups()).toEqual([]);
    expect(lookupField()).toHaveValue('lyravalen');
    expect(screen.getByRole('dialog', { name: 'Perfil completo de Lyra Valen' })).toBeVisible();
  });

  it('an empty field does not look anything up', async () => {
    await openFullProfile();

    await userEvent.type(lookupField(), '   {Enter}');

    expect(lookups()).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an @ that does not exist says so, as typed, and the open card stays', async () => {
    await openFullProfile();

    await lookUp('ByelB');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O usuário "ByelB" não foi encontrado no Lorkarium.',
    );
    const full = screen.getByRole('dialog', { name: 'Perfil completo de Lyra Valen' });
    expect(within(full).getByText('@lyravalen')).toBeInTheDocument();
  });

  it('a text outside the @ format says the same, without a request', async () => {
    await openFullProfile();

    await lookUp('a');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O usuário "a" não foi encontrado no Lorkarium.',
    );
    expect(lookups()).toEqual([]);
  });

  it('a found @ clears the "not found" of the search before', async () => {
    await openFullProfile();
    await lookUp('ByelB');
    await screen.findByRole('alert');

    await lookUp('bia');

    await screen.findByRole('dialog', { name: 'Perfil completo de Bia' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('past the lookup limit it tells the seconds to wait', async () => {
    harness.deps.profileCardApi.answers.answer('cardByUsername', {
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 30 },
    });
    await openFullProfile();

    await lookUp('bia');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitas buscas. Tente de novo em 30 s.',
    );
  });

  it('offline it says the profile could not be opened', async () => {
    harness.deps.profileCardApi.answers.answer('cardByUsername', {
      ok: false,
      failure: { kind: 'offline' },
    });
    await openFullProfile();

    await lookUp('bia');

    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para abrir o perfil.');
  });

  it('a vote on the card found reads that card again, not the one the modal opened with', async () => {
    harness.deps.profileCardApi.put({ ...BIA_CARD, mutualCampaigns: LYRA_CARD.mutualCampaigns });
    await openFullProfile();
    await lookUp('bia');
    const full = await screen.findByRole('dialog', { name: 'Perfil completo de Bia' });

    await userEvent.click(within(full).getByRole('button', { name: /^Aprovar/ }));

    expect(await within(full).findByRole('button', { name: 'Aprovar, 129 votos' })).toBeVisible();
    expect(harness.deps.profileCardApi.answers.callsOf('card')).toContain(BIA_CARD.id);
    expect(full).toHaveTextContent('@bia');
  });

  it('the card found is not read again when it opens', async () => {
    await openFullProfile();

    await lookUp('bia');
    await screen.findByRole('dialog', { name: 'Perfil completo de Bia' });

    expect(harness.deps.profileCardApi.answers.callsOf('card')).not.toContain(BIA_CARD.id);
  });

  it('closing the modal and opening the name again shows the person of the name, not the one found', async () => {
    await openFullProfile();
    await lookUp('bia');
    await screen.findByRole('dialog', { name: 'Perfil completo de Bia' });

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Lyra Valen' }));

    const popover = await screen.findByRole('dialog', { name: 'Perfil de Lyra Valen' });
    expect(within(popover).getByText('@lyravalen')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver perfil completo' }));
    expect(
      await screen.findByRole('dialog', { name: 'Perfil completo de Lyra Valen' }),
    ).toBeVisible();
  });
});
