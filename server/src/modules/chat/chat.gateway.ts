import { CHAT_EVENTS, chatSendCommandDto } from '@lorkarium/contracts';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import type { RealtimeSocket } from '../../realtime/realtime-server';
import { onCommand, type CommandEdgeDeps } from '../board/board-command-edge';
import type { ChatService } from './chat.service';

export type ChatGatewayDeps = CommandEdgeDeps &
  Readonly<{
    chat: Pick<ChatService, 'send'>;
    /** The chat bucket (`CHAT_RATE`), apart from the board's and the dice's. */
    rate: CommandRateGuard;
  }>;

/** Socket.IO edge of the chat: validates `chat:send`, re-reads the session, requires the table
 *  open on this connection and sends as the session's user, outside the table's queue (nothing is
 *  written); the ack carries the `messageId`, the event goes out by the publisher.
 *
 *  Example: `realtime.onConnection(createChatGateway({ chat, rate, realtime, log }))` */
export function createChatGateway(deps: ChatGatewayDeps): (socket: RealtimeSocket) => void {
  const { rate } = deps;
  return (socket) => {
    socket.on(
      CHAT_EVENTS.send,
      onCommand({ deps, rate, socket }, chatSendCommandDto, async (userId, command) => {
        const { messageId } = await deps.chat.send(userId, command, socket.id);
        return { ok: true, messageId } as const;
      }),
    );
  };
}
