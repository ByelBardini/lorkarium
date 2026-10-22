import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerCardHarness } from '../../support/player-card-harness';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  memberCard,
} from '../../support/table-session-fixtures';

const BIA = BIA_AT_TABLE.userId;

describe('PlayerCard, editing', () => {
  let harness: PlayerCardHarness;

  beforeEach(() => {
    harness = new PlayerCardHarness();
  });

  const field = (name: string) => screen.getByRole('textbox', { name });
  const sent = () => harness.commands.sentAs('updateMemberCard').map(({ fields }) => fields);
  const pencil = () => screen.queryByRole('button', { name: 'Mudar o nome de Lyra' });

  it('Bia typing 15 in her CA and leaving the field sends armorClass 15 for her', async () => {
    harness.render();

    await userEvent.type(field('CA de Lyra'), '15');
    await userEvent.tab();

    expect(sent()).toEqual([{ memberId: BIA, changes: { armorClass: 15 } }]);
  });

  it('Enter in the first note sends noteOne', async () => {
    harness.render();

    await userEvent.type(field('Anotação 1 de Lyra'), 'Percepção passiva 14{Enter}');

    expect(sent()).toEqual([{ memberId: BIA, changes: { noteOne: 'Percepção passiva 14' } }]);
  });

  it('the pencil opens "Nome do personagem" with the token name as placeholder; Enter sends it', async () => {
    harness.render();

    await userEvent.click(pencil() ?? document.body);
    const name = field('Nome do personagem');
    expect(name).toHaveAttribute('placeholder', 'Lyra');
    await userEvent.type(name, 'Lyra Vandel{Enter}');

    expect(sent()).toEqual([{ memberId: BIA, changes: { characterName: 'Lyra Vandel' } }]);
    expect(screen.queryByRole('textbox', { name: 'Nome do personagem' })).toBeNull();
  });

  it('erasing the nickname and pressing Enter sends characterName null (back to the token name)', async () => {
    harness.render({ state: { memberCards: [memberCard({ characterName: 'Lyra Vandel' })] } });

    await userEvent.click(screen.getByRole('button', { name: 'Mudar o nome de Lyra Vandel' }));
    await userEvent.clear(field('Nome do personagem'));
    await userEvent.keyboard('{Enter}');

    expect(sent()).toEqual([{ memberId: BIA, changes: { characterName: null } }]);
  });

  it('leaving a field without changing it sends nothing', async () => {
    harness.render({ state: { memberCards: [memberCard({ armorClass: 15 })] } });

    await userEvent.click(field('CA de Lyra'));
    await userEvent.tab();

    expect(sent()).toEqual([]);
  });

  it('letters typed in the CA are filtered as they are typed', async () => {
    harness.render();

    await userEvent.type(field('CA de Lyra'), '1a5');

    expect(field('CA de Lyra')).toHaveValue('15');
  });

  it('an event from someone else while the field has focus keeps the draft; after the blur it shows the confirmed', async () => {
    harness.render();
    await userEvent.type(field('Anotação 1 de Lyra'), 'Fer');

    act(() => harness.confirm({ memberCards: [memberCard({ noteOne: 'Envenenada' })] }));
    expect(field('Anotação 1 de Lyra')).toHaveValue('Fer');
    harness.commands.answerWith({ ok: false, failure: 'forbidden' });
    await userEvent.tab();

    expect(field('Anotação 1 de Lyra')).toHaveValue('Envenenada');
  });

  it('Ana, the master, edits the card of Bia', async () => {
    harness.render({ viewerId: ANA_AT_TABLE.userId, isMaster: true });

    await userEvent.type(field('CD de Lyra'), '13{Enter}');

    expect(sent()).toEqual([{ memberId: BIA, changes: { difficultyClass: 13 } }]);
  });

  it('Esc after typing goes back to the confirmed value without sending', async () => {
    harness.render({ state: { memberCards: [memberCard({ armorClass: 15 })] } });

    await userEvent.type(field('CA de Lyra'), '{Backspace}{Backspace}9{Escape}');

    expect(field('CA de Lyra')).toHaveValue('15');
    expect(sent()).toEqual([]);
  });

  it('a refusal puts the field back to the confirmed value and the reason on the status line', async () => {
    harness.render();
    harness.commands.answerWith({ ok: false, failure: 'forbidden' });

    await userEvent.type(field('CA de Lyra'), '15{Enter}');

    expect(field('CA de Lyra')).toHaveValue('');
    expect(harness.interaction.getState().notice).toBe('forbidden');
  });

  it('Caio sees the fields of Bia read only and no pencil', () => {
    harness.render({ viewerId: CAIO_AT_TABLE.userId });

    expect(field('CA de Lyra')).toHaveAttribute('readonly');
    expect(field('Anotação 1 de Lyra')).toHaveAttribute('readonly');
    expect(pencil()).toBeNull();
  });

  it('while reconnecting the fields and the pencil are disabled', () => {
    harness.render();

    act(() => harness.interaction.getState().setReadOnly(true));

    expect(field('CA de Lyra')).toBeDisabled();
    expect(pencil()).toBeDisabled();
  });

  it('an editable field tells the screen reader how to save', () => {
    harness.render();

    expect(field('CA de Lyra')).toHaveAccessibleDescription(
      'Enter ou sair do campo salva; Esc desfaz.',
    );
  });
});
