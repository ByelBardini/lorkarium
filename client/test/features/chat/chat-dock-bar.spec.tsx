import type { ChatSentDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatDockBar } from '@/features/chat/chat-dock-bar';
import { useChatPeople } from '@/features/chat/use-chat-people';
import { memberColorCss } from '@/lib/member-color';
import { VHARN } from '../../support/campaigns-api-fake';
import { chatMessageIdOf, chatSent, TRIO_GROUP_ID, trioGroup } from '../../support/chat-fixtures';
import {
  BIA_ACCOUNT,
  openVharnChat,
  receiveChat,
  vharnChat,
  vharnTable,
} from '../../support/chat-panel-harness';
import { ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE } from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

/** How many times the bar asked to open the drawer. */
class OpenRequests {
  count = 0;
  readonly open = (): void => void (this.count += 1);
}

describe('ChatDockBar', () => {
  let deps: TestDependencies;
  let requests: OpenRequests;

  beforeEach(() => {
    deps = testDependencies();
    requests = new OpenRequests();
    openVharnChat(deps, {
      account: BIA_ACCOUNT,
      members: [ANA_AT_TABLE, { ...BIA_AT_TABLE, online: true }, CAIO_AT_TABLE],
    });
  });

  function VharnBar(): React.JSX.Element {
    const table = vharnTable(deps);
    const people = useChatPeople(table.presence, deps.sessionStore);
    const panel = {
      campaignId: VHARN.id,
      role: 'player' as const,
      sessionStore: deps.sessionStore,
      openTables: deps.openTables,
      presence: table.presence,
      board: table.board,
      services: deps,
      window: null,
    };
    return <ChatDockBar panel={panel} table={table} people={people} onOpen={requests.open} />;
  }

  function bar(): HTMLElement {
    return screen.getByRole('region', { name: 'Chat da mesa' });
  }

  it('a table nobody spoke at says so, with no counter, and "Abrir chat" asks for the drawer', async () => {
    render(<VharnBar />);
    expect(bar()).toHaveTextContent('Ninguém falou ainda nesta visita.');
    const open = within(bar()).getByRole('button', { name: 'Abrir chat' });
    expect(open).not.toHaveAccessibleDescription();
    await userEvent.click(open);
    expect(requests.count).toBe(1);
  });

  function caioSays(n: number, text: string, overrides: Partial<ChatSentDto> = {}): void {
    const event = chatSent({
      messageId: chatMessageIdOf(n),
      fromUserId: CAIO_AT_TABLE.userId,
      text,
    });
    receiveChat(deps, { ...event, ...overrides });
    act(() => deps.diceClock.advance(1000));
  }

  it('the name of who spoke wears their color, the text stays muted', () => {
    render(<VharnBar />);
    caioSays(1, 'Vou abrir a porta');
    const name = within(bar()).getByText('Caio');
    expect(name).toHaveStyle({ color: memberColorCss(CAIO_AT_TABLE.color) });
    expect(bar()).toHaveTextContent('Caio: Vou abrir a porta');
  });

  it('shows the latest message by arrival, whatever its conversation', () => {
    render(<VharnBar />);
    caioSays(1, 'No grupo', { channel: trioGroup() });
    caioSays(2, 'Na Mesa');
    expect(bar()).toHaveTextContent('Caio: Na Mesa');
    caioSays(3, 'De novo no grupo', { channel: trioGroup() });
    expect(bar()).toHaveTextContent('Caio, em Os Três: De novo no grupo');
  });

  it('a closed conversation leaves the bar: it shows the latest of the open ones', () => {
    render(<VharnBar />);
    caioSays(1, 'Na Mesa');
    caioSays(2, 'No grupo', { channel: trioGroup() });
    act(() => vharnChat(deps).getState().closeConversation(`group:${TRIO_GROUP_ID}`));
    expect(bar()).toHaveTextContent('Caio: Na Mesa');
  });
});
