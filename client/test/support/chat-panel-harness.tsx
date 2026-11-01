import type {
  AuthUserDto,
  BoardStateDto,
  CampaignRoleDto,
  ChatSentDto,
  SessionMemberDto,
} from '@lorkarium/contracts';
import { act, render } from '@testing-library/react';
import type { StoreApi } from 'zustand/vanilla';
import { ChatPanel, type ChatPanelProps } from '@/features/chat/chat-panel';
import type { ChatHistoryStore } from '@/stores/chat-history-store';
import type { OpenTable } from '@/stores/open-tables-store';
import type { TableSessionStatus } from '@/services/table-session-api';
import { ANA } from './auth-api-fake';
import { VHARN } from './campaigns-api-fake';
import { BIA_ACCOUNT } from './dice-panel-harness';
import { ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE, vharnState } from './table-session-fixtures';
import type { TestDependencies } from './app-dependencies';

export { BIA_ACCOUNT } from './dice-panel-harness';

/** Caio's account, signed in. */
export const CAIO_ACCOUNT: AuthUserDto = {
  ...BIA_ACCOUNT,
  id: CAIO_AT_TABLE.userId,
  username: 'caio',
  name: 'Caio',
  email: 'caio@mesa.com',
};

export type ChatTableSetup = Readonly<{
  account?: AuthUserDto;
  /** The roster; Ana and Caio online, Bia offline by default. */
  members?: readonly SessionMemberDto[];
  status?: TableSessionStatus;
}>;

/** Signs `account` (Ana by default) in, opens Vharn, plays the roster and the connection status
 *  (`live` by default).
 *
 *  Example: `openVharnChat(deps, { account: BIA_ACCOUNT, members: [ANA_AT_TABLE, { ...BIA_AT_TABLE, online: true }] })` */
export function openVharnChat(deps: TestDependencies, setup: ChatTableSetup = {}): OpenTable {
  const account = setup.account ?? ANA;
  act(() => {
    deps.sessionStore.getState().signedIn(account);
    deps.openTables.getState().restore(account.id);
    deps.openTables.getState().open({
      campaignId: VHARN.id,
      name: 'Vharn',
      cover: VHARN.cover,
    });
  });
  const members = setup.members ?? [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE];
  deps.tableSessionApi.emitTo(
    VHARN.id,
    { kind: 'state', state: vharnState({ members: [...members] }) },
    { kind: 'status', status: setup.status ?? 'live' },
  );
  return vharnTable(deps);
}

/** The open Vharn of the tab (throws when it is not open). */
export function vharnTable(deps: TestDependencies): OpenTable {
  const table = deps.openTables.getState().tables.find((open) => open.campaignId === VHARN.id);
  if (!table) throw new Error(`Vharn (${VHARN.id}) is not open in the tab`);
  return table;
}

/** The chat store of the open Vharn. */
export function vharnChat(deps: TestDependencies): StoreApi<ChatHistoryStore> {
  return vharnTable(deps).chat;
}

/** A `chat:sent` arriving at Vharn. */
export function receiveChat(deps: TestDependencies, ...events: ChatSentDto[]): void {
  deps.tableSessionApi.emitTo(
    VHARN.id,
    ...events.map((event) => ({ kind: 'chatSent' as const, event })),
  );
}

/** The group grid's snapshot arriving at Vharn ("Falar como" reads its tokens). */
export function receiveBoard(deps: TestDependencies, state: BoardStateDto): void {
  deps.tableSessionApi.emitTo(VHARN.id, { kind: 'board', state });
}

/** The "Chat" tab of Vharn alone, with the group grid as the grid shown.
 *
 *  Example: `renderChatPanel(deps, 'spectator')` */
export function renderChatPanel(
  deps: TestDependencies,
  role: CampaignRoleDto = 'master',
  extra: Partial<ChatPanelProps> = {},
): ReturnType<typeof render> {
  const table = vharnTable(deps);
  return render(
    <ChatPanel
      campaignId={VHARN.id}
      role={role}
      sessionStore={deps.sessionStore}
      openTables={deps.openTables}
      presence={table.presence}
      board={table.board}
      services={deps}
      {...extra}
    />,
  );
}
