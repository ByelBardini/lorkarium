import { screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ANA } from '../../support/auth-api-fake';
import { openVharnChat, renderChatPanel, vharnChat } from '../../support/chat-panel-harness';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function strip(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Conversas' });
}

describe('NewConversationDialog', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(async () => {
    deps = testDependencies();
    user = userEvent.setup();
    openVharnChat(deps);
    renderChatPanel(deps);
    await user.click(within(strip()).getByRole('button', { name: 'Nova conversa' }));
  });

  function dialog(): HTMLElement {
    return screen.getByRole('dialog', { name: 'Nova conversa' });
  }

  it('a direct with one person opens that conversation and sends nothing', async () => {
    await user.click(within(dialog()).getByRole('button', { name: /^Caio/ }));
    expect(screen.queryByRole('dialog', { name: 'Nova conversa' })).toBeNull();
    expect(within(strip()).getByRole('button', { name: 'Caio' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(deps.chat.sent).toEqual([]);
  });

  it('someone offline shows as such: they would not receive', () => {
    const bia = within(dialog()).getByRole('button', { name: /^Bia/ });
    expect(bia).toHaveTextContent('offline — não recebe');
    const caio = within(dialog()).getByRole('button', { name: /^Caio/ });
    expect(caio).not.toHaveTextContent('offline');
  });

  it('a group needs a name and someone else before it can be created', async () => {
    await user.click(within(dialog()).getByRole('radio', { name: 'Grupo' }));
    const create = within(dialog()).getByRole('button', { name: 'Criar grupo' });
    expect(create).toBeDisabled();
    await user.type(within(dialog()).getByLabelText('Nome do grupo'), 'Os Dois');
    expect(create).toBeDisabled();
    await user.click(within(dialog()).getByRole('checkbox', { name: /^Caio/ }));
    expect(create).toBeEnabled();
  });

  it('a group created opens with the viewer among its members and its first message carries them', async () => {
    await user.click(within(dialog()).getByRole('radio', { name: 'Grupo' }));
    await user.type(within(dialog()).getByLabelText('Nome do grupo'), 'Os Dois');
    await user.click(within(dialog()).getByRole('checkbox', { name: /^Caio/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Criar grupo' }));
    expect(within(strip()).getByRole('button', { name: 'Os Dois' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(deps.chat.sent).toEqual([]);
    await user.type(screen.getByRole('combobox', { name: 'Mensagem' }), 'Plano B.{Enter}');
    const channel = deps.chat.sent.at(-1)?.request.channel;
    expect(channel).toMatchObject({
      kind: 'group',
      name: 'Os Dois',
      memberIds: [ANA.id, CAIO_AT_TABLE.userId],
    });
    expect(channel?.kind === 'group' && channel.groupId).toMatch(UUID);
  });

  it('a group of someone offline warns who would not receive, and still sends', async () => {
    await user.click(within(dialog()).getByRole('radio', { name: 'Grupo' }));
    await user.type(within(dialog()).getByLabelText('Nome do grupo'), 'Trio');
    await user.click(within(dialog()).getByRole('checkbox', { name: /^Caio/ }));
    await user.click(within(dialog()).getByRole('checkbox', { name: /^Bia/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Criar grupo' }));
    expect(screen.getByText('Bia está offline e não vai receber.')).toBeInTheDocument();
    await user.type(screen.getByRole('combobox', { name: 'Mensagem' }), 'Oi.{Enter}');
    expect(deps.chat.sent).toHaveLength(1);
    const group = vharnChat(deps).getState().conversations.at(-1)?.target;
    expect(group).toMatchObject({
      kind: 'group',
      memberIds: [ANA.id, CAIO_AT_TABLE.userId, BIA_AT_TABLE.userId],
    });
  });
});
