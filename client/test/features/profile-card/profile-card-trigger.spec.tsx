import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ProfileCardTrigger } from '@/features/profile-card/profile-card-trigger';
import { ProfileCardHarness } from '../../support/profile-card-harness';
import { ANA_CARD, LYRA_CARD, lyraCard } from '../../support/profile-card-fixtures';

const BANNER_ID = '9e8d7c6b-5a49-4f38-8e27-1d0c9b8a7f6e';

describe('ProfileCardTrigger', () => {
  it('the popover shows the nickname, the @, since when, the four attributes and the bio', async () => {
    const popover = await new ProfileCardHarness().open();

    expect(popover).toHaveTextContent('Lyra Valen');
    expect(popover).toHaveTextContent('@lyravalen');
    expect(popover).toHaveTextContent('Desde 05/01/2025');
    expect(within(popover).getByText('Rolagens').parentElement).toHaveTextContent('4.812');
    expect(within(popover).getByText('Críticos').parentElement).toHaveTextContent('241');
    expect(within(popover).getByText('Mestre / joga').parentElement).toHaveTextContent('2 / 5');
    expect(within(popover).getByText('Aprovação').parentElement).toHaveTextContent('97%');
    expect(popover).toHaveTextContent(LYRA_CARD.bio ?? '');
  });

  it('the Dono do Lorkarium is there since the beginning, not since a date', async () => {
    const popover = await new ProfileCardHarness().open(lyraCard({ lorkariumOwner: true }));

    expect(popover).toHaveTextContent('Desde o início');
    expect(popover).not.toHaveTextContent('Desde 05/01/2025');
  });

  it('the profile color is never written as a field, only paints the banner', async () => {
    const popover = await new ProfileCardHarness().open();

    expect(popover).not.toHaveTextContent(/violet|cor do perfil/i);
    expect(within(popover).getByTestId('profile-card-banner')).toHaveStyle({
      backgroundColor: '#b39ddb',
    });
  });

  it('a Grátis account has no seal watermark and no banner image', async () => {
    const popover = await new ProfileCardHarness().open(lyraCard({ plan: 'free' }));

    expect(within(popover).queryByTestId('seal-watermark')).toBeNull();
    expect(within(popover).queryByTestId('profile-card-banner-image')).toBeNull();
  });

  it('an Apoiador has the seal as the watermark and its banner image', async () => {
    const popover = await new ProfileCardHarness().open(lyraCard({ bannerId: BANNER_ID }));

    expect(within(popover).getByTestId('seal-watermark')).toHaveAttribute('data-seal', 'apoiador');
    expect(within(popover).getByTestId('profile-card-banner-image')).toHaveAttribute(
      'src',
      `/api/banners/${BANNER_ID}`,
    );
  });

  it('below five votes the approval reads "Sem votos suficientes", not a percent', async () => {
    const reputation = { up: 3, down: 1, myVote: null, percent: null };
    const popover = await new ProfileCardHarness().open(lyraCard({ reputation }));

    expect(within(popover).getByText('Aprovação').parentElement).toHaveTextContent(
      'Sem votos suficientes',
    );
    expect(popover).not.toHaveTextContent('%');
  });

  it.each([
    ['online', 'Online'],
    ['offline', 'Offline'],
  ] as const)('a friend %s shows the presence "%s"', async (presence, label) => {
    const popover = await new ProfileCardHarness().open(lyraCard({ presence }));

    expect(within(popover).getByText(label)).toBeInTheDocument();
  });

  it('without presence (not a friend) the card shows neither Online nor Offline', async () => {
    const popover = await new ProfileCardHarness().open(
      lyraCard({ presence: null, relation: 'none' }),
    );

    expect(popover).not.toHaveTextContent(/online|offline/i);
  });

  it('"Ver perfil completo" opens the full profile with systems, schedule, contact and tables in common', async () => {
    await new ProfileCardHarness().open();

    await userEvent.click(screen.getByRole('button', { name: 'Ver perfil completo' }));
    const full = await screen.findByRole('dialog', { name: 'Perfil completo de Lyra Valen' });

    expect(full).toHaveTextContent(`Sistemas e cenários${LYRA_CARD.gameSystems ?? ''}`);
    expect(full).toHaveTextContent(`Horários${LYRA_CARD.playSchedule ?? ''}`);
    expect(full).toHaveTextContent(`Contato${LYRA_CARD.contact ?? ''}`);
    expect(full).toHaveTextContent('A Queda de Varn');
    expect(full).toHaveTextContent('Ruínas de Kael');
    expect(full).toHaveTextContent('5 amigos em comum');
    expect(screen.queryByRole('dialog', { name: 'Perfil de Lyra Valen' })).toBeNull();
  });

  it('the popover leaves the full-profile sections out', async () => {
    const popover = await new ProfileCardHarness().open();

    expect(popover).not.toHaveTextContent('Sistemas e cenários');
    expect(popover).not.toHaveTextContent('Ruínas de Kael');
  });

  it('the account reading its own card sees no actions', async () => {
    const popover = await new ProfileCardHarness().open(ANA_CARD);

    expect(within(popover).queryByRole('button', { name: /mensagem/i })).toBeNull();
    expect(within(popover).queryByRole('button', { name: 'Mais ações' })).toBeNull();
    expect(within(popover).queryByRole('button', { name: /aprovar/i })).toBeNull();
  });

  // Fase 12 e2e: under five votes the own card showed no count at all, so 1 vote was invisible.
  it('the own card shows its vote counts even below the minimum for a percent', async () => {
    const reputation = { up: 1, down: 0, myVote: null, percent: null };
    const popover = await new ProfileCardHarness().open({ ...ANA_CARD, reputation });

    expect(within(popover).getByRole('img', { name: 'Aprovações, 1 voto' })).toHaveTextContent('1');
    expect(within(popover).getByRole('img', { name: 'Reprovações, 0 votos' })).toBeInTheDocument();
  });

  it('while the card loads the popover says so', async () => {
    const harness = new ProfileCardHarness();
    harness.deps.profileCardApi.answers.hold('card');
    harness.render();

    await userEvent.click(screen.getByRole('button', { name: 'Lyra Valen' }));

    expect(await screen.findByText('Carregando perfil…')).toBeInTheDocument();
  });

  it('a failed read shows the error and "Tentar de novo" reads it again', async () => {
    const harness = new ProfileCardHarness();
    harness.deps.profileCardApi.answers.answer('card', {
      ok: false,
      failure: { kind: 'offline' },
    });
    harness.render();
    await userEvent.click(screen.getByRole('button', { name: 'Lyra Valen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para abrir o perfil.');
    harness.deps.profileCardApi.answers.clear('card');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('@lyravalen')).toBeInTheDocument();
  });

  it('outside a signed-in shell the name is plain text, not a button', () => {
    render(<ProfileCardTrigger userId={LYRA_CARD.id} name="Lyra Valen" />);

    expect(screen.getByText('Lyra Valen')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
