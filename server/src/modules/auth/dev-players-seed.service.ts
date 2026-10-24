import type { NodeEnv } from '../../config/env';
import { emailIndexOf, toSealedEmail } from './auth.mapper';
import type { DataCipherPort } from './data-cipher.port';
import {
  DEV_PLAYER_PASSWORD,
  DEV_PLAYERS,
  DevPlayersSeedBo,
  type DevPlayerAccount,
} from './dev-players-seed.bo';
import type { PasswordHasherPort } from './password-hasher.port';
import type { UsersDao } from './users.dao';

export type DevPlayersSeedDeps = Readonly<{
  users: Pick<UsersDao, 'findByEmailIndex' | 'insert'>;
  hasher: PasswordHasherPort;
  cipher: DataCipherPort;
  newId: () => string;
}>;

export type DevPlayersSeedResult = Readonly<{
  created: readonly string[];
  skipped: readonly string[];
}>;

/** Creates the test players a dev database lacks (`pnpm db:seed-dev`); never rewrites an account.
 *
 *  Example: `await new DevPlayersSeedService({ users, hasher, cipher, newId }).seed(env.nodeEnv)` */
export class DevPlayersSeedService {
  constructor(private readonly deps: DevPlayersSeedDeps) {}

  async seed(nodeEnv: NodeEnv): Promise<DevPlayersSeedResult> {
    const seedBo = new DevPlayersSeedBo(nodeEnv);
    seedBo.requireAllowed();
    const decision = seedBo.decide(await this.existingEmails());
    if (decision.create.length > 0) {
      const passwordHash = await this.deps.hasher.hash(DEV_PLAYER_PASSWORD);
      for (const player of decision.create) await this.insert(player, passwordHash);
    }
    return { created: decision.create.map((player) => player.email), skipped: decision.skipped };
  }

  private async insert(
    { email, ...player }: DevPlayerAccount,
    passwordHash: string,
  ): Promise<void> {
    const id = this.deps.newId();
    const sealed = toSealedEmail(this.deps.cipher, id, email);
    await this.deps.users.insert({ id, ...player, ...sealed, passwordHash });
  }

  private async existingEmails(): Promise<ReadonlySet<string>> {
    const found = await Promise.all(
      DEV_PLAYERS.map(async ({ email }) => {
        const row = await this.deps.users.findByEmailIndex(emailIndexOf(this.deps.cipher, email));
        return row ? [email] : [];
      }),
    );
    return new Set(found.flat());
  }
}
