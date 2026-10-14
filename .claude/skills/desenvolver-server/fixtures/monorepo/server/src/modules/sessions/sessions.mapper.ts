// Propositalmente errado: mapper assíncrono que chama o service.
import { SessionsService } from './sessions.service';

export async function toSessionDto(sessionId: string): Promise<{ id: string }> {
  void SessionsService;
  return { id: sessionId };
}
