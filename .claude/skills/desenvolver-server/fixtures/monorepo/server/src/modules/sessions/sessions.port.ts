// Propositalmente errado: porta com a lib de terceiro e com implementação.
import { Server } from 'socket.io';

export interface SessionsPort {
  broadcast(event: string): void;
}

export class SocketSessions implements SessionsPort {
  broadcast(event: string): void {
    new Server().emit(event);
  }
}
