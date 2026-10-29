import type { FastifyBaseLogger } from 'fastify';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import { createChatGateway } from './chat.gateway';
import { ChatService, type ChatServiceDeps } from './chat.service';

export type ChatModuleOptions = ChatServiceDeps &
  Readonly<{
    realtime: Pick<Realtime, 'reauthenticate'>;
    /** A guard built with `CHAT_RATE`, never the board's shared one. */
    rate: CommandRateGuard;
    log: FastifyBaseLogger;
  }>;

export type ChatModule = Readonly<{ gateway: (socket: RealtimeSocket) => void }>;

/** Wires the chat module: the message service and its Socket.IO edge.
 *
 *  Example: `realtime.onConnection(createChatModule(options).gateway)` */
export function createChatModule(options: ChatModuleOptions): ChatModule {
  const { realtime, rate, log, ...serviceDeps } = options;
  const chat = new ChatService(serviceDeps);
  return { gateway: createChatGateway({ chat, rate, realtime, log }) };
}
