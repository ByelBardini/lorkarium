import type { NodeEnv } from '../../config/env';
import { DEV_PLAYER_PASSWORD, DEV_PLAYERS, DevPlayersSeedBo } from './dev-players-seed.bo';
import type { PasswordHasherPort } from './password-hasher.port';
import type { UsersDao } from './users.dao';

export type DevPlayersSeedResult = Readonly<{
  created: readonly string[];
  skipped: readonly string[];
}>;

/** Creates the test players a dev database lacks (`pnpm db:seed-dev`); never rewrites an account.
 *
 *  Example: `await new DevPlayersSeedService(usersDao, hasher).seed(env.nodeEnv)` */
export class DevPlayersSeedService {
  constructor(
    private readonly users: Pick<UsersDao, 'findByEmail' | 'insert'>,
    private readonly hasher: PasswordHasherPort,
  ) {}

  async seed(nodeEnv: NodeEnv): Promise<DevPlayersSeedResult> {
    const seedBo = new DevPlayersSeedBo(nodeEnv);
    seedBo.requireAllowed();
    const decision = seedBo.decide(await this.existingEmails());
    if (decision.create.length > 0) {
      const passwordHash = await this.hasher.hash(DEV_PLAYER_PASSWORD);
      for (const player of decision.create) await this.users.insert({ ...player, passwordHash });
    }
    return { created: decision.create.map((player) => player.email), skipped: decision.skipped };
  }

  private async existingEmails(): Promise<ReadonlySet<string>> {
    const found = await Promise.all(DEV_PLAYERS.map(({ email }) => this.users.findByEmail(email)));
    return new Set(found.flatMap((row) => (row ? [row.email] : [])));
  }
}
