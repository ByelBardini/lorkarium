import type { PasswordHasherPort } from '../auth/password-hasher.port';
import type { UsersDao } from '../auth/users.dao';
import type { UserPo } from '../auth/users.po';
import { CurrentPasswordInvalidError } from './account-security.error';

/** The password typed again before a sensitive change (new password, e-mail, 2FA).
 *
 *  Example: `const row = await currentPassword.require(userId, input.currentPassword)` */
export class CurrentPasswordService {
  constructor(
    private readonly users: Pick<UsersDao, 'findById'>,
    private readonly hasher: PasswordHasherPort,
  ) {}

  /** The account row when `password` is its current one; refuses with CURRENT_PASSWORD_INVALID. */
  async require(userId: string, password: string): Promise<UserPo> {
    const row = await this.users.findById(userId);
    const matches = row ? await this.hasher.verify(row.passwordHash, password) : false;
    if (!row || !matches) throw new CurrentPasswordInvalidError(userId);
    return row;
  }
}
