import type { CombatEntryInput, TokenDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CombatPrep, type CombatPrepProps } from '@/features/combat/combat-prep';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  kael,
  lyra,
  soloCombatant,
  vharnCombat,
} from '../../support/table-session-fixtures';

const KAEL = kael({ id: 'kael', controllerIds: [BIA_AT_TABLE.userId] });
const LYRA = lyra({ id: 'lyra', controllerIds: [] });
const BANDIDOS = [1, 2, 3, 4, 5, 6].map((n) =>
  lyra({ id: `bandido-${n}`, name: `Bandido ${n}`, side: 'enemy', controllerIds: [] }),
);

type Rendered = Readonly<{ submitted: (readonly CombatEntryInput[])[]; cancels: number[] }>;

function renderPrep(
  overrides: Partial<CombatPrepProps> = {},
  tokens: readonly TokenDto[] = [KAEL, LYRA, ...BANDIDOS],
): Rendered {
  const rendered = { submitted: [] as (readonly CombatEntryInput[])[], cancels: [] as number[] };
  render(
    <CombatPrep
      mode="start"
      tokens={tokens}
      combat={null}
      members={[ANA_AT_TABLE, BIA_AT_TABLE]}
      readOnly={false}
      onSubmit={(entries) => rendered.submitted.push(entries)}
      onCancel={() => rendered.cancels.push(1)}
      {...overrides}
    />,
  );
  return rendered;
}

const start = () => screen.getByRole('button', { name: 'Começar combate' });

describe('CombatPrep', () => {
  it('shows "Quem entra na briga?", the way back and the sections Grupo and Inimigos e outros', () => {
    renderPrep();

    expect(screen.getByRole('heading', { name: 'Quem entra na briga?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar sem iniciar' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Grupo' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Inimigos e outros' })).toBeInTheDocument();
  });

  it('who plays reads "jogado por Bia", and a token nobody plays reads "NPC"', () => {
    renderPrep();

    const grupo = within(screen.getByRole('list', { name: 'Grupo' }));
    expect(grupo.getByText('jogado por Bia')).toBeInTheDocument();
    expect(grupo.getByText('NPC')).toBeInTheDocument();
  });

  it('everyone comes checked: 3 in the order; unchecking Kael leaves 2', async () => {
    renderPrep();
    expect(screen.getByText('3 na ordem')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Incluir Kael' }));

    expect(screen.getByText('2 na ordem')).toBeInTheDocument();
  });

  it('"Cada um" lists the bandits, and three of them out leave the group checkbox mixed', async () => {
    renderPrep();
    const acting = screen.getByRole('radiogroup', { name: 'Iniciativa de Bandido' });
    await userEvent.click(within(acting).getByRole('radio', { name: 'Cada um' }));

    for (const n of [1, 2, 3])
      await userEvent.click(screen.getByRole('checkbox', { name: `Incluir Bandido ${n}` }));

    const group = screen.getByRole('checkbox', { name: 'Incluir o grupo Bandido' });
    expect(group).toHaveAttribute('aria-checked', 'mixed');
    expect(screen.getByText('3 de 6 marcados')).toBeInTheDocument();
    expect(screen.getByText('5 na ordem')).toBeInTheDocument();
  });

  it('"Juntos" has one field for the group; "Cada um" one per bandit', async () => {
    renderPrep();
    expect(screen.getByRole('textbox', { name: 'Iniciativa de Bandido' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Iniciativa de Bandido 1' })).toBeNull();

    await userEvent.click(screen.getByRole('radio', { name: 'Cada um' }));

    expect(screen.queryByRole('textbox', { name: 'Iniciativa de Bandido' })).toBeNull();
    expect(screen.getAllByRole('textbox', { name: /^Iniciativa de Bandido \d$/ })).toHaveLength(6);
  });

  it('"abc" in Kael marks the field invalid, says why, and blocks "Começar combate"', async () => {
    renderPrep();
    const field = screen.getByRole('textbox', { name: 'Iniciativa de Kael' });

    await userEvent.type(field, 'abc');

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('De −999 a 999');
    expect(screen.getByText('Iniciativa inválida em Kael.')).toBeInTheDocument();
    expect(start()).toBeDisabled();
  });

  it('"Começar combate" sends Kael 18, Lyra −2 and the bandits together with 15', async () => {
    const { submitted } = renderPrep();
    await userEvent.type(screen.getByRole('textbox', { name: 'Iniciativa de Kael' }), '18');
    await userEvent.type(screen.getByRole('textbox', { name: 'Iniciativa de Lyra' }), '−2');
    await userEvent.type(screen.getByRole('textbox', { name: 'Iniciativa de Bandido' }), '15');

    await userEvent.click(start());

    expect(submitted).toEqual([
      [
        { name: null, tokenIds: ['kael'], initiative: 18 },
        { name: null, tokenIds: ['lyra'], initiative: -2 },
        { name: 'Bandido', tokenIds: BANDIDOS.map(({ id }) => id), initiative: 15 },
      ],
    ]);
  });

  it('the lines left blank are told in the footer', () => {
    renderPrep({}, [KAEL, LYRA]);

    expect(screen.getByText('Kael e Lyra começam sem iniciativa')).toBeInTheDocument();
  });

  it('"Desmarcar todos" leaves nobody: "Ninguém na ordem" and "Começar combate" off; "Marcar todos" brings all back', async () => {
    renderPrep();

    await userEvent.click(screen.getByRole('button', { name: 'Desmarcar todos' }));

    expect(screen.getByText('Ninguém na ordem')).toBeInTheDocument();
    expect(start()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Marcar todos' }));
    expect(screen.getByText('3 na ordem')).toBeInTheDocument();
  });

  it('read only (disconnected) keeps the lines editable but "Começar combate" off', async () => {
    renderPrep({ readOnly: true });

    await userEvent.type(screen.getByRole('textbox', { name: 'Iniciativa de Kael' }), '9');

    expect(screen.getByRole('textbox', { name: 'Iniciativa de Kael' })).toHaveValue('9');
    expect(start()).toBeDisabled();
  });

  it('"Cancelar" and the way back call onCancel and send nothing', async () => {
    const { submitted, cancels } = renderPrep();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voltar sem iniciar' }));

    expect(cancels).toHaveLength(2);
    expect(submitted).toEqual([]);
  });

  it('adding: titled "Adicionar ao combate", only who is out, and "Adicionar" sends them', async () => {
    const combat = vharnCombat({ combatants: [soloCombatant('c-kael', 'kael', 18, 0)] });
    const { submitted } = renderPrep({ mode: 'add', combat }, [KAEL, LYRA]);

    expect(screen.getByRole('heading', { name: 'Adicionar ao combate' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Incluir Kael' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(submitted).toEqual([[{ name: null, tokenIds: ['lyra'], initiative: null }]]);
  });
});
