import type { ChatSentDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { ChatPhoneButton } from '@/features/chat/chat-phone-button';
import type { ChatWindowSlot } from '@/features/chat/chat-window-slot';
import { TABLE_CONVERSATION_KEY } from '@/lib/chat-conversations';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { chatMessageIdOf, chatSent } from '../../support/chat-fixtures';
import {
  BIA_ACCOUNT,
  openVharnChat,
  receiveChat,
  vharnChat,
  vharnTable,
} from '../../support/chat-panel-harness';
import { emulateViewport } from '../../support/viewport';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;

function caioSays(n: number, text: string, overrides: Partial<ChatSentDto> = {}): ChatSentDto {
  return chatSent({ messageId: chatMessageIdOf(n), fromUserId: CAIO, text, ...overrides });
}

/** "Abrir em outra janela" and "Trazer de volta" of the room's chat window, counted. */
class PhoneChatWindowSlotSpy {
  broughtBack = 0;
  opened = 0;

  detached(): ChatWindowSlot {
    return { kind: 'detached', bringBack: () => void (this.broughtBack += 1) };
  }

  docked(): ChatWindowSlot {
    return { kind: 'docked', open: () => void (this.opened += 1), notice: null };
  }
}

function chatButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Chat' });
}

function chatSheet(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Chat da mesa' });
}

describe('ChatPhoneButton', () => {
  emulateViewport('mobile');
  let deps: TestDependencies;
  let user: UserEvent;
  let slot: PhoneChatWindowSlotSpy;

  beforeEach(() => {
    deps = testDependencies();
    user = userEvent.setup();
    slot = new PhoneChatWindowSlotSpy();
    openVharnChat(deps, {
      account: BIA_ACCOUNT,
      members: [ANA_AT_TABLE, { ...BIA_AT_TABLE, online: true }, CAIO_AT_TABLE],
    });
  });

  function renderButton(window: ChatWindowSlot | null = slot.docked()) {
    const table = vharnTable(deps);
    return render(
      <ChatPhoneButton
        panel={{
          campaignId: VHARN.id,
          role: 'player',
          sessionStore: deps.sessionStore,
          openTables: deps.openTables,
          presence: table.presence,
          board: table.board,
          services: deps,
          window,
        }}
        roomLayout={deps.roomLayout}
      />,
    );
  }

  it('a new message is counted on "Chat", neutral, as "1 mensagem não lida"', () => {
    renderButton();
    receiveChat(deps, caioSays(1, 'Vou abrir a porta'));
    expect(chatButton()).toHaveAccessibleDescription('1 mensagem não lida');
    expect(chatButton().querySelector('[data-important]')).toHaveAttribute(
      'data-important',
      'false',
    );
  });

  it('a whisper to the viewer turns the counter gold', () => {
    renderButton();
    receiveChat(deps, caioSays(1, 'Só você', { channel: { kind: 'table', whisperTo: BIA } }));
    expect(chatButton().querySelector('[data-important]')).toHaveAttribute(
      'data-important',
      'true',
    );
  });

  it('tapping "Chat" opens a sheet with the conversation, which is read at once', async () => {
    renderButton();
    receiveChat(deps, caioSays(1, 'Vou abrir a porta'));
    await user.click(chatButton());
    expect(within(chatSheet()).getByRole('log')).toHaveTextContent('Vou abrir a porta');
    expect(vharnChat(deps).getState().activeKey).toBe(TABLE_CONVERSATION_KEY);
    // The open sheet is modal: the button behind it is hidden from the accessibility tree.
    const behind = screen.getByRole('button', { name: 'Chat', hidden: true });
    expect(behind).not.toHaveAccessibleDescription();
  });

  it('closing the sheet leaves no conversation shown: the next message is counted again', async () => {
    renderButton();
    await user.click(chatButton());
    await user.click(within(chatSheet()).getByRole('button', { name: 'Fechar' }));
    receiveChat(deps, caioSays(1, 'Entrem'));
    expect(vharnChat(deps).getState().activeKey).toBeNull();
    expect(chatButton()).toHaveAccessibleDescription('1 mensagem não lida');
  });

  it('the sheet has no "Abrir em outra janela": a phone has no other window', async () => {
    renderButton(slot.docked());
    await user.click(chatButton());
    expect(within(chatSheet()).getByRole('combobox', { name: 'Mensagem' })).toBeInTheDocument();
    expect(within(chatSheet()).queryByRole('button', { name: 'Abrir em outra janela' })).toBeNull();
  });

  it('a chat already in another window (from a wider screen) is brought back from the sheet', async () => {
    renderButton(slot.detached());
    await user.click(chatButton());
    await user.click(within(chatSheet()).getByRole('button', { name: 'Trazer de volta' }));
    expect(slot.broughtBack).toBe(1);
  });

  it('a message is announced once, with the sheet closed or open', async () => {
    renderButton();
    receiveChat(deps, caioSays(1, 'Vou abrir a porta'));
    expect(screen.getAllByTestId('chat-announcer')).toHaveLength(1);
    expect(screen.getByTestId('chat-announcer')).toHaveTextContent('Caio: Vou abrir a porta');
    await user.click(chatButton());
    receiveChat(deps, caioSays(2, 'Entrem'));
    expect(screen.getAllByTestId('chat-announcer')).toHaveLength(1);
  });

  it('draws nothing before the table opens', () => {
    const empty = testDependencies();
    render(
      <ChatPhoneButton
        panel={{
          campaignId: VHARN.id,
          role: 'player',
          sessionStore: empty.sessionStore,
          openTables: empty.openTables,
          presence: null,
          board: null,
          services: empty,
        }}
        roomLayout={empty.roomLayout}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();
  });
});

describe('play room on a phone: "Chat" beside "Painel"', () => {
  emulateViewport('mobile');
  let deps: TestDependencies;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard() },
    );
    await act(() => Promise.resolve());
  });

  it('"Chat" sits in the board’s corner just before "Painel", with no chat bar', () => {
    const painel = screen.getByRole('button', { name: 'Painel' });
    expect(chatButton().parentElement).toBe(painel.parentElement);
    // Before it in the reading order: on the left, as it is drawn.
    expect(chatButton().compareDocumentPosition(painel)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByRole('region', { name: 'Chat da mesa' })).toBeNull();
  });

  it('"Painel" carries no chat count and its sheet has no "Chat" tab', async () => {
    deps.tableSessionApi.emit({ kind: 'chatSent', event: chatSent() });
    const painel = screen.getByRole('button', { name: 'Painel' });
    expect(painel).not.toHaveAccessibleDescription();
    expect(chatButton()).toHaveAccessibleDescription('1 mensagem não lida');
    await userEvent.click(painel);
    const sheet = screen.getByRole('dialog', { name: 'Painel da mesa' });
    expect(
      within(sheet)
        .getAllByRole('tab')
        .map((tab) => tab.textContent?.replace(/\d+$/, '')),
    ).toEqual(['Combate', 'Na mesa', 'Dados']);
  });
});
