import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ControlField } from '@/features/tokens/control-field';
import type { TokenPlayer } from '@/features/tokens/token-form-state';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../../support/table-session-fixtures';

const PLAYERS: readonly TokenPlayer[] = [BIA_AT_TABLE, CAIO_AT_TABLE].map(({ userId, name }) => ({
  userId,
  name,
}));

type HarnessProps = Readonly<{ initial?: readonly string[]; players?: readonly TokenPlayer[] }>;

function Harness({ initial = [], players = PLAYERS }: HarnessProps) {
  const [controllerIds, setControllerIds] = useState(initial);
  return (
    <>
      <ControlField controllerIds={controllerIds} players={players} onChange={setControllerIds} />
      <output aria-label="Quem controla agora">{controllerIds.join(',')}</output>
    </>
  );
}

describe('ControlField', () => {
  it('shows one button per player, none pressed, saying the master already controls everything', () => {
    render(<Harness />);

    expect(screen.getByRole('group', { name: 'Quem controla' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bia' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Caio' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Você, como mestre, já controla tudo.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Quem controla move o token, mexe nas barras e condições e vê as barras escondidas.',
      ),
    ).toBeInTheDocument();
  });

  it('pressing Bia and Caio makes both control it', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Bia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Caio' }));

    expect(screen.getByRole('button', { name: 'Bia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Quem controla agora')).toHaveTextContent(
      `${BIA_AT_TABLE.userId},${CAIO_AT_TABLE.userId}`,
    );
  });

  it('pressing Bia again takes her out: nobody left is the master alone', async () => {
    render(<Harness initial={[BIA_AT_TABLE.userId]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bia' }));

    expect(screen.getByRole('button', { name: 'Bia' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Quem controla agora')).toBeEmptyDOMElement();
  });

  it('without players at the table, it says so and offers no button', () => {
    render(<Harness players={[]} />);

    expect(screen.getByText('Nenhum jogador na mesa ainda.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
