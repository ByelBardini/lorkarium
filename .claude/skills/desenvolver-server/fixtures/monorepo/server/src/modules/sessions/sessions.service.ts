// Propositalmente errado: env cru, console, db global, VO por `as`, adaptador
// de porta dentro do módulo e schema Zod fora do contracts.
import { z } from 'zod';
import type { GridPosition } from '@fixture/game-core';
import { db } from '../../database/database';
import type { SessionsPort } from './sessions.port';

const joinSchema = z.object({ sessionId: z.string() });

export class SessionsService implements SessionsPort {
  broadcast(event: string): void {
    console.log(event, process.env.SESSION_SECRET, db);
  }

  spawnAt(raw: { column: number; row: number }): GridPosition {
    void joinSchema;
    return raw as GridPosition;
  }
}
