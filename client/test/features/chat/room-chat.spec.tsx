import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { RoomChat } from '@/features/chat/room-chat';
import { VHARN } from '../../support/campaigns-api-fake';
import { chatMessageIdOf, chatSent } from '../../support/chat-fixtures';
import { BIA_ACCOUNT, openVharnChat, receiveChat } from '../../support/chat-panel-harness';
import { emulateViewport } from '../../support/viewport';
import { ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE } from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;

function openAsBia(deps: TestDependencies): void {
  openVharnChat(deps, {
    account: BIA_ACCOUNT,
    members: [ANA_AT_TABLE, { ...BIA_AT_TABLE, online: true }, CAIO_AT_TABLE],
  });
}

function renderRoomChat(deps: TestDependencies): void {
  const table = deps.openTables.getState().tables.find((open) => open.campaignId === VHARN.id);
  render(
    <RoomChat
      tableName="Vharn"
      panel={{
        campaignId: VHARN.id,
        role: 'player',
        sessionStore: deps.sessionStore,
        openTables: deps.openTables,
        presence: table?.presence ?? null,
        board: table?.board ?? null,
        services: deps,
      }}
      roomLayout={deps.roomLayout}
      services={deps}
    />,
  );
}

describe('RoomChat', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  it('before the table opens the tab has the plain title and no chat bar', () => {
    renderRoomChat(deps);
    expect(document.title).toBe('Lorkarium · Vharn');
    expect(screen.queryByRole('region', { name: 'Chat da mesa' })).toBeNull();
  });

  it('a whisper to the viewer marks the title as important', () => {
    openAsBia(deps);
    renderRoomChat(deps);
    const channel = { kind: 'table', whisperTo: BIA } as const;
    receiveChat(deps, chatSent({ messageId: chatMessageIdOf(1), fromUserId: CAIO, channel }));
    expect(document.title).toBe('(1!) Lorkarium · Vharn');
  });

  it('the viewer’s own message naming them rings nothing, while Caio’s does', () => {
    openAsBia(deps);
    renderRoomChat(deps);
    receiveChat(
      deps,
      chatSent({ messageId: chatMessageIdOf(1), fromUserId: BIA, text: '@Bia ok' }),
    );
    expect(deps.chatSounds.latest().plays).toBe(0);
    receiveChat(deps, chatSent({ messageId: chatMessageIdOf(2), fromUserId: CAIO, text: '@Bia?' }));
    expect(deps.chatSounds.latest().plays).toBe(1);
  });
});

describe('RoomChat on a phone', () => {
  emulateViewport('mobile');

  it('draws no chat bar, and the title still counts the unread messages', () => {
    const deps = testDependencies();
    openAsBia(deps);
    renderRoomChat(deps);
    receiveChat(deps, chatSent({ messageId: chatMessageIdOf(1), fromUserId: CAIO }));
    expect(screen.queryByRole('region', { name: 'Chat da mesa' })).toBeNull();
    expect(document.title).toBe('(1) Lorkarium · Vharn');
  });
});
