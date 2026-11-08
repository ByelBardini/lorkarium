import { cell } from '@lorkarium/game-core';
import type { TokenDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenDialog, type TokenDialogViewer } from '@/features/tokens/token-dialog';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { BIA_AT_TABLE, lyra, VHARN_GRID } from '../../support/table-session-fixtures';

const BLOCKER_LIMIT_MESSAGE = 'A cena já tem o máximo de 50 tokens que bloqueiam a visão.';
const ROUND_NOTICE = 'Com borda redonda, bloqueia pelo disco.';
const BIA: TokenDialogViewer = {
  mode: 'player',
  userId: BIA_AT_TABLE.userId,
  canDelete: false,
  canEdit: true,
};

let commands: TableBoardCommandsFake;
let closed: number;

beforeEach(() => {
  commands = new TableBoardCommandsFake();
  closed = 0;
});

function renderDialog(token: TokenDto | null, viewer?: TokenDialogViewer): void {
  render(
    <TokenDialog
      scope={VHARN_GRID}
      token={token}
      placeAt={cell(9, 5)}
      layer="tokens"
      players={[]}
      commands={commands}
      assets={new AssetsApiFake()}
      distance={{ cellDistance: 1.5, cellUnit: 'm' }}
      connected
      viewer={viewer}
      onClose={() => {
        closed += 1;
      }}
    />,
  );
}

async function openVision(): Promise<void> {
  await userEvent.click(screen.getByRole('tab', { name: 'Visão e luz' }));
}

async function flipBlocker(): Promise<void> {
  await userEvent.click(screen.getByRole('switch', { name: 'Bloqueia a visão' }));
}

async function save(name = 'Salvar'): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name }));
}

function sentEdit(): unknown {
  return commands.sentAs('updateToken')[0]?.fields;
}

describe('TokenDialog, "Bloqueia a visão"', () => {
  it('switched on and saved, the edit sends blocksSight true', async () => {
    renderDialog(lyra());
    await openVision();

    await flipBlocker();
    await save();

    expect(sentEdit()).toMatchObject({ blocksSight: true });
  });

  it('a token that blocks opens on, and switched off sends false', async () => {
    renderDialog(lyra({ blocksSight: true }));
    await openVision();
    expect(screen.getByRole('switch', { name: 'Bloqueia a visão' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await flipBlocker();
    await save();

    expect(sentEdit()).toMatchObject({ blocksSight: false });
  });

  it.each([true, false])(
    'untouched, a token with blocksSight %s sends no such field',
    async (blocksSight) => {
      renderDialog(lyra({ blocksSight }));

      await save();

      expect(sentEdit()).toBeDefined();
      expect(sentEdit()).not.toHaveProperty('blocksSight');
    },
  );

  it('a new token switched on is created blocking', async () => {
    renderDialog(null);
    await userEvent.type(screen.getByLabelText('Nome'), 'Estátua');
    await openVision();

    await flipBlocker();
    await save('Criar token');

    expect(commands.sentAs('createToken')[0]?.fields).toMatchObject({ blocksSight: true });
  });

  it('a new token left alone is created with no such field', async () => {
    renderDialog(null);
    await userEvent.type(screen.getByLabelText('Nome'), 'Ogro');

    await save('Criar token');

    expect(commands.sentAs('createToken')[0]?.fields).toBeDefined();
    expect(commands.sentAs('createToken')[0]?.fields).not.toHaveProperty('blocksSight');
  });

  it('a player author sees no switch and sends no such field, even on a token that blocks', async () => {
    renderDialog(lyra({ blocksSight: true }), BIA);

    expect(screen.queryByRole('tab', { name: 'Visão e luz' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Bloqueia a visão' })).not.toBeInTheDocument();
    await save();

    expect(sentEdit()).toBeDefined();
    expect(sentEdit()).not.toHaveProperty('blocksSight');
  });

  it('refused by the limit, from another tab, it goes to the tab and says the limit there', async () => {
    renderDialog(lyra());
    await openVision();
    await flipBlocker();
    await userEvent.click(screen.getByRole('tab', { name: 'Básico' }));
    commands.answerWith({ ok: false, failure: 'token_blocker_limit' });

    await save();

    const blocker = await screen.findByRole('group', { name: 'Bloqueia a visão' });
    expect(within(blocker).getByRole('alert')).toHaveTextContent(BLOCKER_LIMIT_MESSAGE);
    expect(screen.getAllByText(BLOCKER_LIMIT_MESSAGE)).toHaveLength(1);
    expect(closed).toBe(0);
  });

  it('any other refusal stays in the footer, with the tab where it was', async () => {
    renderDialog(lyra());
    commands.answerWith({ ok: false, failure: 'token_limit' });

    await save();

    expect(await screen.findByText('A cena já tem o máximo de 500 tokens.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Básico' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a round token warns of the disc', async () => {
    renderDialog(lyra({ blocksSight: true, frame: 'round' }));

    await openVision();

    expect(screen.getByText(ROUND_NOTICE)).toBeInTheDocument();
  });

  it('the frame chosen for the active form counts before it is saved', async () => {
    const baseForm = {
      id: '0f0e0d0c-0b0a-4908-8706-050403020100',
      name: 'Base',
      imageAssetId: null,
      width: 1,
      height: 1,
      frame: 'square',
    } as const;
    renderDialog(lyra({ blocksSight: true, forms: [baseForm], activeFormId: baseForm.id }));
    await userEvent.click(screen.getByRole('tab', { name: /Formas/ }));

    await userEvent.click(screen.getByRole('radio', { name: 'Redonda' }));
    await openVision();

    expect(screen.getByText(ROUND_NOTICE)).toBeInTheDocument();
  });
});
