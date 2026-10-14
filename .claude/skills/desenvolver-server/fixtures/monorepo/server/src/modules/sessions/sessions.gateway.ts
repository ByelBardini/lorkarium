// Propositalmente errado: gateway sem DTO e fora de qualquer plugin.
import type { Socket } from 'socket.io';

export function sessionGateway(socket: Socket): void {
  socket.on('session:leave', (payload: { sessionId: string }) => {
    socket.leave(payload.sessionId);
  });
}
