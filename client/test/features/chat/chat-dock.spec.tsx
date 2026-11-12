import type { CampaignRoleDto, ChatSentDto } from '@lorkarium/contracts';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { useRoomShortcuts } from '@/features/board/use-room-shortcuts';
import { ChatDock, type ChatDockProps } from '@/features/chat/chat-dock';
import { CHAT_DRAWER_STEP } from '@/features/chat/chat-drawer';
import type { ChatWindowSlot } from '@/features/chat/chat-window-slot';
import { CHAT_DRAWER_DEFAULT_HEIGHT } from '@/lib/chat-drawer-height';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import {
  ROOM_CHAT_HEIGHT_STORAGE_KEY,
  ROOM_CHAT_STORAGE_KEY,
  type RoomLayoutStore,
} from '@/stores/room-layout-store';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { chatMessageIdOf, chatSent, directBetween } from '../../support/chat-fixtures';
import {
  BIA_ACCOUNT,
  openVharnChat,
  receiveChat,
  vharnTable,
} from '../../support/chat-panel-harness';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  VHARN_GRID,
} from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;
const BOARD_HEIGHT = 900;

function caioSays(n: number, text: string, overrides: Partial<ChatSentDto> = {}): ChatSentDto {
  return chatSent({ messageId: chatMessageIdOf(n), fromUserId: CAIO, text, ...overrides });
}

function anaWhispers(n: number, text: string): ChatSentDto {
  const channel = { kind: 'table', whisperTo: BIA } as const;
  return chatSent({ messageId: chatMessageIdOf(n), fromUserId: ANA.id, channel, text });
}

/** "Trazer de volta" and "Abrir em outra janela" of the room's chat window, counted. */
class ChatWindowSlotSpy {
  broughtBack = 0;
  opened = 0;

  detached(): ChatWindowSlot {
    return { kind: 'detached', bringBack: () => void (this.broughtBack += 1) };
  }

  docked(notice: string | null): ChatWindowSlot {
    return { kind: 'docked', open: () => void (this.opened += 1), notice };
  }
}

function bar(): HTMLElement {
  return screen.getByRole('region', { name: 'Chat da mesa' });
}

function drawer(): HTMLElement {
  return screen.getByRole('region', { name: 'Conversa' });
}

function openButton(): HTMLElement {
  return within(bar()).getByRole('button', { name: 'Abrir chat' });
}

function field(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Mensagem' });
}

function previews(): HTMLElement {
  return screen.getByRole('list', { name: 'Mensagens novas' });
}

function barCounter(): Element | null {
  return bar().querySelector('[data-important]');
}

type ShortcutsOfTheRoomProps = Readonly<{ roomLayout: StoreApi<RoomLayoutStore> }>;

/** The room's keys on `window`, as the `PlayRoomPage` mounts them, for a player. */
function ShortcutsOfTheRoom({ roomLayout }: ShortcutsOfTheRoomProps): null {
  const [interaction] = useState(() =>
    createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    }),
  );
  useRoomShortcuts({ roomLayout, interaction, role: 'player' });
  return null;
}

describe('ChatDock', () => {
  let deps: TestDependencies;
  let user: UserEvent;
  let slot: ChatWindowSlotSpy;

  beforeEach(() => {
    deps = testDependencies();
    user = userEvent.setup();
    slot = new ChatWindowSlotSpy();
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(BOARD_HEIGHT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function openAsBia(): void {
    openVharnChat(deps, {
      account: BIA_ACCOUNT,
      members: [ANA_AT_TABLE, { ...BIA_AT_TABLE, online: true }, CAIO_AT_TABLE],
    });
  }

  function renderDock(extra: Partial<ChatDockProps> = {}, role: CampaignRoleDto = 'player') {
    const table = vharnTable(deps);
    return render(
      <ChatDock
        campaignId={VHARN.id}
        role={role}
        sessionStore={deps.sessionStore}
        openTables={deps.openTables}
        presence={table.presence}
        board={table.board}
        services={deps}
        roomLayout={deps.roomLayout}
        clock={deps.interactionClock}
        window={slot.docked(null)}
        {...extra}
      />,
    );
  }

  describe('the bar', () => {
    beforeEach(openAsBia);

    it('a message with the drawer closed shows on the bar with its counter and a preview above it', () => {
      renderDock();
      receiveChat(deps, caioSays(1, 'Vou abrir a porta'));
      expect(bar()).toHaveTextContent('Caio: Vou abrir a porta');
      expect(openButton()).toHaveAccessibleDescription('1 mensagem não lida');
      expect(barCounter()).toHaveAttribute('data-important', 'false');
      const preview = within(previews()).getByRole('button', { name: 'Caio: Vou abrir a porta' });
      expect(
        preview.compareDocumentPosition(bar()) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'Conversa' })).toBeNull();
    });

    it('a whisper to the viewer turns the bar counter gold', () => {
      renderDock();
      receiveChat(deps, anaWhispers(1, 'Só você vê a marca'));
      expect(barCounter()).toHaveAttribute('data-important', 'true');
    });

    it('the latest message of any conversation is the one on the bar', () => {
      renderDock();
      receiveChat(deps, caioSays(1, 'Vou abrir a porta'));
      receiveChat(deps, caioSays(2, 'Só pra você', { channel: directBetween(BIA, CAIO) }));
      expect(bar()).toHaveTextContent('Caio, no privado: Só pra você');
      expect(openButton()).toHaveAccessibleDescription('2 mensagens não lidas');
    });

    it('a message is announced once, with the drawer closed or open', async () => {
      renderDock();
      receiveChat(deps, caioSays(1, 'Vou abrir a porta'));
      expect(screen.getAllByTestId('chat-announcer')).toHaveLength(1);
      expect(screen.getByTestId('chat-announcer')).toHaveTextContent('Caio: Vou abrir a porta');
      await user.click(openButton());
      receiveChat(deps, caioSays(2, 'Entrem'));
      expect(screen.getAllByTestId('chat-announcer')).toHaveLength(1);
    });

    it('the preview leaves after 7 s, the bar keeps the message', () => {
      renderDock();
      receiveChat(deps, caioSays(1, 'Vou abrir a porta'));
      act(() => deps.interactionClock.advance(7000));
      expect(screen.queryByRole('list', { name: 'Mensagens novas' })).toBeNull();
      expect(bar()).toHaveTextContent('Caio: Vou abrir a porta');
    });
  });

  describe('the drawer', () => {
    beforeEach(openAsBia);

    it('"Abrir chat" opens the drawer with the feed, focuses the composer and reads the Table', async () => {
      renderDock();
      receiveChat(deps, caioSays(1, 'Vou abrir a porta'));
      await user.click(openButton());
      expect(within(drawer()).getByRole('log')).toHaveTextContent('Vou abrir a porta');
      expect(field()).toHaveFocus();
      expect(within(drawer()).getByRole('button', { name: 'Mesa' })).toBeInTheDocument();
      expect(deps.roomLayoutStorage.getItem(ROOM_CHAT_STORAGE_KEY)).toBe('open');
      expect(screen.queryByRole('region', { name: 'Chat da mesa' })).toBeNull();
    });

    it('"Recolher chat" closes the drawer, remembers it closed and gives the focus back to the bar', async () => {
      renderDock();
      await user.click(openButton());
      await user.click(within(drawer()).getByRole('button', { name: 'Recolher chat' }));
      expect(screen.queryByRole('region', { name: 'Conversa' })).toBeNull();
      expect(deps.roomLayoutStorage.getItem(ROOM_CHAT_STORAGE_KEY)).toBe('closed');
      expect(openButton()).toHaveFocus();
    });

    it('a drawer remembered open opens with the room, at its height', () => {
      act(() => {
        deps.roomLayout.getState().openChat();
        deps.roomLayout.getState().setChatHeight(400);
      });
      renderDock();
      expect(drawer()).toHaveStyle({ height: '400px' });
      expect(field()).toHaveFocus();
    });

    it('dragging the handle 100 px up grows the drawer, up to 70% of the board', () => {
      act(() => deps.roomLayout.getState().setChatHeight(560));
      renderDock();
      act(() => deps.roomLayout.getState().openChat());
      const handle = within(drawer()).getByRole('separator', { name: 'Altura do chat' });
      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 500 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 400 });
      fireEvent.pointerUp(handle, { pointerId: 1, clientY: 400 });
      expect(deps.roomLayout.getState().chatHeight).toBe(630);
      expect(deps.roomLayoutStorage.getItem(ROOM_CHAT_HEIGHT_STORAGE_KEY)).toBe('630');
      expect(drawer()).toHaveStyle({ height: '630px' });
    });

    it('ArrowUp on the handle grows the drawer by one step, ArrowDown shrinks it back', () => {
      renderDock();
      act(() => deps.roomLayout.getState().openChat());
      const handle = within(drawer()).getByRole('separator', { name: 'Altura do chat' });
      fireEvent.keyDown(handle, { key: 'ArrowUp' });
      expect(deps.roomLayout.getState().chatHeight).toBe(
        CHAT_DRAWER_DEFAULT_HEIGHT + CHAT_DRAWER_STEP,
      );
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
      expect(deps.roomLayout.getState().chatHeight).toBe(CHAT_DRAWER_DEFAULT_HEIGHT);
    });

    it('Esc in the composer closes the drawer', async () => {
      renderDock();
      await user.click(openButton());
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('region', { name: 'Conversa' })).toBeNull();
      expect(deps.roomLayout.getState().chat).toBe('closed');
    });

    it('Esc on the suggestions of the composer closes only them', async () => {
      renderDock();
      await user.click(openButton());
      await user.type(field(), '/');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(drawer()).toBeInTheDocument();
    });

    it('clicking a preview opens the drawer on its conversation', async () => {
      renderDock();
      receiveChat(deps, caioSays(1, 'Só pra você', { channel: directBetween(BIA, CAIO) }));
      await user.click(within(previews()).getByRole('button', { name: /Só pra você/ }));
      expect(within(drawer()).getByRole('log')).toHaveAccessibleName('Mensagens: Caio');
      expect(field()).toHaveFocus();
    });
  });

  describe('Esc and the room shortcuts', () => {
    beforeEach(openAsBia);

    it('Esc inside the drawer closes it without leaving focus mode (the shortcuts listen on window)', async () => {
      render(<ShortcutsOfTheRoom roomLayout={deps.roomLayout} />);
      renderDock();
      act(() => {
        deps.roomLayout.getState().toggleFocus();
        deps.roomLayout.getState().openChat();
      });
      within(drawer()).getByRole('button', { name: 'Recolher chat' }).focus();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('region', { name: 'Conversa' })).toBeNull();
      expect(deps.roomLayout.getState().focus).toBe(true);
    });

    it('Esc outside the drawer still leaves focus mode', async () => {
      render(<ShortcutsOfTheRoom roomLayout={deps.roomLayout} />);
      renderDock();
      act(() => deps.roomLayout.getState().toggleFocus());
      await user.keyboard('{Escape}');
      expect(deps.roomLayout.getState().focus).toBe(false);
    });
  });

  describe('T and the room shortcuts', () => {
    beforeEach(openAsBia);

    it('T on the board opens the drawer with the composer focused and empty', async () => {
      render(<ShortcutsOfTheRoom roomLayout={deps.roomLayout} />);
      renderDock();
      await user.keyboard('t');
      expect(field()).toHaveFocus();
      expect(field()).toHaveValue('');
      expect(deps.roomLayout.getState().chat).toBe('open');
    });

    it('Shift+T with the drawer already open and the focus elsewhere takes the focus back to the composer', async () => {
      render(<ShortcutsOfTheRoom roomLayout={deps.roomLayout} />);
      renderDock();
      act(() => deps.roomLayout.getState().openChat());
      act(() => within(drawer()).getByRole('button', { name: 'Recolher chat' }).focus());
      await user.keyboard('{Shift>}T{/Shift}');
      expect(field()).toHaveFocus();
      expect(field()).toHaveValue('');
    });

    it('T typed in the composer is only the letter', async () => {
      render(<ShortcutsOfTheRoom roomLayout={deps.roomLayout} />);
      renderDock();
      await user.click(openButton());
      await user.keyboard('t');
      expect(field()).toHaveValue('t');
      expect(deps.roomLayout.getState().chatFocusRequest).toBe(0);
    });

    it('T with the chat in another window opens no drawer and leaves the chat closed', async () => {
      render(<ShortcutsOfTheRoom roomLayout={deps.roomLayout} />);
      renderDock({ window: slot.detached() });
      await user.keyboard('t');
      expect(screen.queryByRole('region', { name: 'Conversa' })).toBeNull();
      expect(deps.roomLayout.getState().chat).toBe('closed');
    });
  });

  describe('the window of the chat', () => {
    beforeEach(openAsBia);

    it('detached: the bar says so, "Trazer de volta" calls the slot and no drawer opens', async () => {
      act(() => deps.roomLayout.getState().openChat());
      renderDock({ window: slot.detached() });
      expect(bar()).toHaveTextContent('Chat aberto em outra janela');
      expect(within(bar()).queryByRole('button', { name: 'Abrir chat' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Conversa' })).toBeNull();
      await user.click(within(bar()).getByRole('button', { name: 'Trazer de volta' }));
      expect(slot.broughtBack).toBe(1);
    });

    it('blocked by the browser: the drawer says so beside "Abrir em outra janela"', async () => {
      renderDock({ window: slot.docked('O navegador bloqueou a janela do chat.') });
      await user.click(openButton());
      expect(drawer()).toHaveTextContent('O navegador bloqueou a janela do chat.');
      await user.click(within(drawer()).getByRole('button', { name: 'Abrir em outra janela' }));
      expect(slot.opened).toBe(1);
    });

    it('a plan without separate windows: the drawer says "Disponível no Narrador"', async () => {
      renderDock({ window: slot.docked('Disponível no Narrador') });
      await user.click(openButton());
      expect(drawer()).toHaveTextContent('Disponível no Narrador');
    });
  });

  describe('a spectator', () => {
    beforeEach(openAsBia);

    it('sees the bar and talks to the Table from the drawer', async () => {
      renderDock({}, 'spectator');
      await user.click(openButton());
      await user.type(field(), 'Boa noite{Enter}');
      expect(deps.chat.sent).toEqual([
        {
          campaignId: VHARN.id,
          request: {
            channel: { kind: 'table', whisperTo: null },
            speaker: { kind: 'self' },
            text: 'Boa noite',
          },
        },
      ]);
    });
  });
});
