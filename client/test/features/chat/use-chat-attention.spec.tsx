import { act, render, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { RoomChat } from '@/features/chat/room-chat';
import { useChatAttention } from '@/features/chat/use-chat-attention';
import { VHARN } from '../../support/campaigns-api-fake';
import { ChatAttentionFake } from '../../support/chat-attention-fakes';
import { chatMessageIdOf, chatSent } from '../../support/chat-fixtures';
import { openVharnChat, receiveChat } from '../../support/chat-panel-harness';
import { ANA_AT_TABLE, BIA_AT_TABLE } from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const ANA = ANA_AT_TABLE.userId;
const BIA = BIA_AT_TABLE.userId;

describe('useChatAttention', () => {
  let deps: TestDependencies;
  let attention: ChatAttentionFake;

  beforeEach(() => {
    deps = testDependencies();
    attention = new ChatAttentionFake();
  });

  it('reports each message from someone else of an open table, never the viewer’s own', () => {
    openVharnChat(deps);
    renderHook(() => useChatAttention(deps.openTables, attention, ANA));
    receiveChat(deps, chatSent({ messageId: chatMessageIdOf(1), fromUserId: BIA }));
    receiveChat(deps, chatSent({ messageId: chatMessageIdOf(2), fromUserId: ANA }));
    expect(attention.messages).toEqual([VHARN.id]);
  });

  it('a table opened after mounting is heard too', () => {
    renderHook(() => useChatAttention(deps.openTables, attention, ANA));
    openVharnChat(deps);
    receiveChat(deps, chatSent({ messageId: chatMessageIdOf(1), fromUserId: BIA }));
    expect(attention.messages).toEqual([VHARN.id]);
  });

  it('closing the table tells which are still open and stops hearing it', () => {
    const table = openVharnChat(deps);
    renderHook(() => useChatAttention(deps.openTables, attention, ANA));
    act(() => deps.openTables.getState().close(VHARN.id));
    table.chat
      .getState()
      .apply(
        { kind: 'chatSent', event: chatSent({ messageId: chatMessageIdOf(1), fromUserId: BIA }) },
        0,
      );
    expect(attention.openSets.at(-1)).toEqual([]);
    expect(attention.messages).toEqual([]);
  });

  it('unmounting stops hearing every table', () => {
    openVharnChat(deps);
    const hook = renderHook(() => useChatAttention(deps.openTables, attention, ANA));
    hook.unmount();
    receiveChat(deps, chatSent({ messageId: chatMessageIdOf(1), fromUserId: BIA }));
    expect(attention.messages).toEqual([]);
  });

  it('without attention (the browser) nothing is heard', () => {
    openVharnChat(deps);
    renderHook(() => useChatAttention(deps.openTables, null, ANA));
    receiveChat(deps, chatSent({ messageId: chatMessageIdOf(1), fromUserId: BIA }));
    expect(attention.messages).toEqual([]);
  });
});

describe('RoomChat and the taskbar button', () => {
  let deps: TestDependencies;
  let attention: ChatAttentionFake;

  beforeEach(() => {
    deps = testDependencies();
    attention = new ChatAttentionFake();
  });

  function renderRoomChat(onScreen: boolean): () => void {
    const table = openVharnChat(deps);
    const view = render(
      <RoomChat
        tableName="Vharn"
        panel={{
          campaignId: VHARN.id,
          role: 'player',
          sessionStore: deps.sessionStore,
          openTables: deps.openTables,
          presence: table.presence,
          board: table.board,
          services: deps,
        }}
        roomLayout={deps.roomLayout}
        services={{ ...deps, chatAttention: attention }}
        onScreen={onScreen}
      />,
    );
    return view.unmount;
  }

  it('the room on screen reports itself with its chat docked, until it goes', () => {
    const unmount = renderRoomChat(true);
    expect(attention.shownRooms()).toEqual([VHARN.id]);
    expect(attention.rooms[0]?.chatWindow).toBeNull();
    unmount();
    expect(attention.shownRooms()).toEqual([]);
  });

  it('a room covered by a page (settings, conditions) is not on screen', () => {
    renderRoomChat(false);
    expect(attention.rooms).toEqual([]);
  });
});
