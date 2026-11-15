import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RUI_BLOCKED } from '../../support/friends-fixtures';
import { ProfileCardHarness } from '../../support/profile-card-harness';
import { LYRA_CARD, lyraCard } from '../../support/profile-card-fixtures';

async function openMenu(popover: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(within(popover).getByRole('button', { name: 'Mais ações' }));
  return screen.findByRole('menu');
}

describe('profile card actions', () => {
  it('a thumbs up is sent, shown as pressed with the new count, and a second click takes it back', async () => {
    const harness = new ProfileCardHarness();
    const popover = await harness.open();
    const api = harness.deps.profileCardApi;

    await userEvent.click(within(popover).getByRole('button', { name: /^Aprovar/ }));
    const up = await within(popover).findByRole('button', { name: 'Aprovar, 129 votos' });
    expect(up).toHaveAttribute('aria-pressed', 'true');
    expect(api.answers.callsOf('vote')).toEqual([{ userId: LYRA_CARD.id, value: 1 }]);

    await userEvent.click(up);
    expect(
      await within(popover).findByRole('button', { name: 'Aprovar, 128 votos' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(api.answers.callsOf('removeVote')).toEqual([LYRA_CARD.id]);
  });

  it('a thumbs down over an up vote switches the vote', async () => {
    const harness = new ProfileCardHarness();
    const reputation = { up: 128, down: 4, myVote: 1, percent: 97 } as const;
    const popover = await harness.open(lyraCard({ reputation }));

    await userEvent.click(within(popover).getByRole('button', { name: /^Reprovar/ }));

    expect(
      await within(popover).findByRole('button', { name: 'Reprovar, 5 votos' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(harness.deps.profileCardApi.answers.callsOf('vote')).toEqual([
      { userId: LYRA_CARD.id, value: -1 },
    ]);
  });

  it('without a table in common the vote buttons are disabled and say why', async () => {
    const popover = await new ProfileCardHarness().open(lyraCard({ mutualCampaigns: [] }));

    const up = within(popover).getByRole('button', { name: /^Aprovar/ });
    expect(up).toBeDisabled();
    expect(within(popover).getByRole('button', { name: /^Reprovar/ })).toBeDisabled();
    expect(up).toHaveAccessibleDescription('Só quem divide uma mesa com a pessoa pode votar.');
  });

  it('the menu of a friend offers to undo the friendship, which asks first', async () => {
    const harness = new ProfileCardHarness();
    harness.deps.friendsApi.answers.answer('removeFriend', { ok: true, value: null });
    const menu = await openMenu(await harness.open());

    expect(within(menu).queryByRole('menuitem', { name: 'Adicionar amigo' })).toBeNull();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Desfazer amizade' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Remover Lyra Valen dos amigos?',
    });
    expect(harness.deps.friendsApi.answers.callsOf('removeFriend')).toEqual([]);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remover' }));

    expect(harness.deps.friendsApi.answers.callsOf('removeFriend')).toEqual([LYRA_CARD.id]);
  });

  it('the menu of someone who is not a friend offers to add them by the @', async () => {
    const harness = new ProfileCardHarness();
    harness.deps.friendsApi.answers.answer('sendRequest', { ok: true, value: 'sent' });
    const popover = await harness.open(lyraCard({ relation: 'none', presence: null }));
    const menu = await openMenu(popover);

    expect(within(menu).queryByRole('menuitem', { name: 'Desfazer amizade' })).toBeNull();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Adicionar amigo' }));

    expect(harness.deps.friendsApi.answers.callsOf('sendRequest')).toEqual(['lyravalen']);
    expect(await screen.findByText('Pedido enviado para Lyra Valen.')).toBeInTheDocument();
  });

  it('blocking asks for confirmation before it blocks', async () => {
    const harness = new ProfileCardHarness();
    harness.deps.friendsApi.answers.answer('block', { ok: true, value: RUI_BLOCKED });
    const menu = await openMenu(await harness.open());

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Bloquear' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Bloquear Lyra Valen?' });
    expect(harness.deps.friendsApi.answers.callsOf('block')).toEqual([]);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Bloquear' }));

    expect(harness.deps.friendsApi.answers.callsOf('block')).toEqual([{ userId: LYRA_CARD.id }]);
  });

  it('the report needs a reason, sends it with the details and says "Denúncia enviada"', async () => {
    const harness = new ProfileCardHarness();
    const menu = await openMenu(await harness.open());
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Denunciar' }));
    const report = await screen.findByRole('dialog', { name: 'Denunciar Lyra Valen' });

    const send = within(report).getByRole('button', { name: 'Enviar denúncia' });
    expect(send).toBeDisabled();
    await userEvent.click(within(report).getByRole('radio', { name: 'Spam' }));
    await userEvent.type(within(report).getByLabelText(/Detalhes/), 'Links em toda mensagem');
    await userEvent.click(send);

    expect(await within(report).findByText('Denúncia enviada.')).toBeInTheDocument();
    expect(harness.deps.profileCardApi.answers.callsOf('report')).toEqual([
      { userId: LYRA_CARD.id, report: { reason: 'spam', details: 'Links em toda mensagem' } },
    ]);
  });

  it('a report while another is open says "Você já tem uma denúncia aberta"', async () => {
    const harness = new ProfileCardHarness();
    harness.deps.profileCardApi.answers.answer('report', {
      ok: false,
      failure: { kind: 'report_already_open' },
    });
    const menu = await openMenu(await harness.open());
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Denunciar' }));
    const report = await screen.findByRole('dialog', { name: 'Denunciar Lyra Valen' });
    await userEvent.click(within(report).getByRole('radio', { name: 'Assédio' }));
    await userEvent.click(within(report).getByRole('button', { name: 'Enviar denúncia' }));

    expect(await within(report).findByRole('alert')).toHaveTextContent(
      'Você já tem uma denúncia aberta sobre essa pessoa.',
    );
  });

  it('"Mensagem" opens the private conversation with an online friend', async () => {
    const popover = await new ProfileCardHarness().open();

    await userEvent.click(within(popover).getByRole('button', { name: 'Mensagem' }));

    expect(await screen.findByText(`Conversa com ${LYRA_CARD.id}`)).toBeInTheDocument();
  });

  it.each([
    ['an offline friend', lyraCard({ presence: 'offline' })],
    ['someone who is not a friend', lyraCard({ relation: 'none', presence: null })],
  ])('"Mensagem" is disabled for %s', async (_who, card) => {
    const popover = await new ProfileCardHarness().open(card);

    expect(within(popover).getByRole('button', { name: 'Mensagem' })).toBeDisabled();
  });
});
