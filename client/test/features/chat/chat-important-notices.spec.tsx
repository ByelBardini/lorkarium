import type { ChatSentDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatDock } from '@/features/chat/chat-dock';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { chatMessageIdOf, chatSent, directBetween, trioGroup } from '../../support/chat-fixtures';
import {
  BIA_ACCOUNT,
  openVharnChat,
  receiveChat,
  vharnTable,
} from '../../support/chat-panel-harness';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  VHARN_GRID,
} from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;
const KAEL = { kind: 'token', sceneId: VHARN_GRID.sceneId, tokenId: 'kael', name: 'Kael' } as const;

function anaWhispers(n: number, text: string): ChatSentDto {
  const channel = { kind: 'table', whisperTo: BIA } as const;
  return chatSent({ messageId: chatMessageIdOf(n), fromUserId: ANA.id, channel, text });
}

function caioSays(n: number, text: string, overrides: Partial<ChatSentDto> = {}): ChatSentDto {
  return chatSent({ messageId: chatMessageIdOf(n), fromUserId: CAIO, text, ...overrides });
}

function notices(): HTMLElement {
  return screen.getByRole('list', { name: 'Avisos importantes' });
}

function noticeButtons(): HTMLElement[] {
  return within(notices()).getAllByRole('button');
}

function bar(): HTMLElement {
  return screen.getByRole('region', { name: 'Chat da mesa' });
}

function drawerLog(): HTMLElement {
  return within(screen.getByRole('region', { name: 'Conversa' })).getByRole('log');
}

describe('ChatImportantNotices', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(() => {
    deps = testDependencies();
    user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(900);
    openVharnChat(deps, {
      account: BIA_ACCOUNT,
      members: [ANA_AT_TABLE, { ...BIA_AT_TABLE, online: true }, CAIO_AT_TABLE],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderDock(): void {
    const table = vharnTable(deps);
    render(
      <ChatDock
        campaignId={VHARN.id}
        role="player"
        sessionStore={deps.sessionStore}
        openTables={deps.openTables}
        presence={table.presence}
        board={table.board}
        services={deps}
        roomLayout={deps.roomLayout}
        clock={deps.interactionClock}
        window={{ kind: 'docked', open: () => undefined, notice: null }}
      />,
    );
  }

  it('a whisper to the viewer becomes a notice with who, where and the text, above the bar', () => {
    renderDock();
    receiveChat(deps, anaWhispers(1, 'Só você vê a marca'));
    const [notice] = noticeButtons();
    expect(notice).toHaveAccessibleName('Ana · Sussurro na Mesa Só você vê a marca');
    expect(
      notices().compareDocumentPosition(bar()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each([
    ['a whisper', anaWhispers(1, 'Só você vê a marca'), 'Ana · Sussurro na Mesa'],
    [
      'a mention as a token',
      caioSays(1, '@Bia, atrás de você', { speaker: KAEL }),
      'Kael (Caio) · Mesa',
    ],
    [
      'a mention in a direct',
      caioSays(1, '@Bia, vem cá', { channel: directBetween(BIA, CAIO) }),
      'Caio · Privado',
    ],
    [
      'a mention in a group',
      caioSays(1, '@Bia, vem cá', { channel: trioGroup() }),
      'Caio · Os Três',
    ],
  ])('%s is headed by the voice and the conversation', (_case, event, head) => {
    renderDock();
    receiveChat(deps, event);
    expect(noticeButtons()[0]).toHaveAccessibleName(`${head} ${event.text}`);
  });

  it('the notice is still there 30 s later, when the preview would have left', () => {
    renderDock();
    receiveChat(deps, anaWhispers(1, 'Só você vê a marca'));
    act(() => deps.interactionClock.advance(30_000));
    expect(noticeButtons()).toHaveLength(1);
    expect(noticeButtons()[0]).toHaveTextContent('Só você vê a marca');
  });

  it('clicking the notice opens the drawer on its conversation and takes the notice out', async () => {
    renderDock();
    receiveChat(deps, anaWhispers(1, 'Só você vê a marca'));
    await user.click(noticeButtons()[0]!);
    expect(drawerLog()).toHaveAccessibleName('Mensagens: Mesa');
    expect(drawerLog()).toHaveTextContent('Só você vê a marca');
    expect(screen.queryByRole('list', { name: 'Avisos importantes' })).toBeNull();
  });

  it('opening the chat from the bar reads the Table and takes its whisper notice out', async () => {
    renderDock();
    receiveChat(deps, anaWhispers(1, 'Só você vê a marca'));
    await user.click(within(bar()).getByRole('button', { name: 'Abrir chat' }));
    expect(screen.queryByRole('list', { name: 'Avisos importantes' })).toBeNull();
  });

  it('an important message is a notice only, never also a plain preview', () => {
    renderDock();
    receiveChat(deps, anaWhispers(1, 'Só você vê a marca'));
    expect(noticeButtons()).toHaveLength(1);
    expect(screen.queryByRole('list', { name: 'Mensagens novas' })).toBeNull();
  });

  it('a direct without a mention is a preview only, with no notice', () => {
    renderDock();
    receiveChat(deps, caioSays(1, 'Só pra você', { channel: directBetween(BIA, CAIO) }));
    expect(screen.getByRole('list', { name: 'Mensagens novas' })).toHaveTextContent('Só pra você');
    expect(screen.queryByRole('list', { name: 'Avisos importantes' })).toBeNull();
  });

  it('a fourth important takes out the oldest notice, and the bar still counts the four', () => {
    renderDock();
    receiveChat(deps, ...[1, 2, 3, 4].map((n) => anaWhispers(n, `Sussurro ${n}`)));
    const [second, third, fourth] = noticeButtons();
    expect(noticeButtons()).toHaveLength(3);
    expect(second).toHaveAccessibleName('Ana · Sussurro na Mesa Sussurro 2');
    expect(third).toHaveAccessibleName('Ana · Sussurro na Mesa Sussurro 3');
    expect(fourth).toHaveAccessibleName('Ana · Sussurro na Mesa Sussurro 4');
    const open = within(bar()).getByRole('button', { name: 'Abrir chat' });
    expect(open).toHaveAccessibleDescription('4 mensagens não lidas');
    expect(bar().querySelector('[data-important]')).toHaveAttribute('data-important', 'true');
  });

  it('with the drawer open on the conversation, a whisper there sets off no notice', () => {
    act(() => deps.roomLayout.getState().openChat());
    renderDock();
    receiveChat(deps, anaWhispers(1, 'Só você vê a marca'));
    expect(drawerLog()).toHaveTextContent('Só você vê a marca');
    expect(screen.queryByRole('list', { name: 'Avisos importantes' })).toBeNull();
  });

  it('with the drawer open on the Table, a mention in a direct shows a notice that moves the drawer there', async () => {
    act(() => deps.roomLayout.getState().openChat());
    renderDock();
    receiveChat(deps, caioSays(1, '@Bia, vem cá', { channel: directBetween(BIA, CAIO) }));
    await user.click(noticeButtons()[0]!);
    expect(drawerLog()).toHaveAccessibleName('Mensagens: Caio');
    expect(screen.queryByRole('list', { name: 'Avisos importantes' })).toBeNull();
  });

  it('the notice is silent: the chat announcer says the whisper once', () => {
    renderDock();
    receiveChat(deps, anaWhispers(1, 'Só você vê a marca'));
    expect(notices()).toHaveAttribute('aria-live', 'off');
    const spoken = document.querySelectorAll(
      '[aria-live="polite"], [role="status"], [role="alert"]',
    );
    const saying = [...spoken].filter((each) => each.textContent?.includes('Só você vê a marca'));
    expect(saying).toHaveLength(1);
    expect(saying[0]).toHaveTextContent('Ana sussurrou para você: Só você vê a marca');
  });
});
