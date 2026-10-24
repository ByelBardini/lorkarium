import type { NodeEnv } from '../../config/env';
import { DevSeedRefusedError } from './auth.error';

// Shared by every dev box and by the e2e (e2e/test/support/dev-players.ts): never a real secret.
export const DEV_PLAYER_PASSWORD = 'lorkarium-dev';

export type DevPlayerAccount = Readonly<{
  username: string;
  name: string;
  email: string;
  role: 'user';
}>;

// The @ is fixed (the e2e and the stress seed find them by it); the nicknames stay Bia and Caio.
export const DEV_PLAYERS: readonly DevPlayerAccount[] = [
  { username: 'bia', name: 'Bia', email: 'bia@lorkarium.dev', role: 'user' },
  { username: 'caio', name: 'Caio', email: 'caio@lorkarium.dev', role: 'user' },
];

export type DevPlayersSeedDecision = Readonly<{
  create: readonly DevPlayerAccount[];
  skipped: readonly string[];
}>;

/** Which test players a dev database still lacks; refuses to run against production.
 *
 *  Example: `new DevPlayersSeedBo('development').decide(new Set(['bia@lorkarium.dev']))` */
export class DevPlayersSeedBo {
  constructor(private readonly nodeEnv: NodeEnv) {}

  requireAllowed(): void {
    if (this.nodeEnv === 'production') throw new DevSeedRefusedError(this.nodeEnv);
  }

  decide(existingEmails: ReadonlySet<string>): DevPlayersSeedDecision {
    this.requireAllowed();
    const create = DEV_PLAYERS.filter((player) => !existingEmails.has(player.email));
    const skipped = DEV_PLAYERS.filter((player) => existingEmails.has(player.email));
    return { create, skipped: skipped.map((player) => player.email) };
  }
}
