import type { AuthUserDto, LoginRequestDto, TwoFactorLoginRequestDto } from '@lorkarium/contracts';
import type { AuthApi, AuthResult, LoginResult, TwoFactorLoginResult } from '@/services/auth-api';
import { CallJournal } from './call-journal';

export const ANA: AuthUserDto = {
  id: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01',
  username: 'ana',
  name: 'Ana',
  email: 'ana@mesa.com',
  role: 'user',
  color: 'teal',
  avatarId: null,
};

export const ROOT_ADMIN: AuthUserDto = {
  id: '0b6d2c7e-1a9f-4c3e-8d5b-2f4a6c8e0a12',
  username: 'admin',
  name: 'Admin',
  email: 'root@lorkarium.dev',
  role: 'admin',
  color: 'bone',
  avatarId: null,
};

type Pending<T> = { promise: Promise<T>; resolve: (value: T) => void };

function pending<T>(): Pending<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Scripted `AuthApi`: each call answers what the test set, or waits until the test releases it.
 *  `logout` writes `logout` to the journal. */
export class AuthApiFake implements AuthApi {
  readonly loginCalls: LoginRequestDto[] = [];
  readonly twoFactorCalls: TwoFactorLoginRequestDto[] = [];
  private twoFactorAnswers: TwoFactorLoginResult[] = [];
  logoutCalls = 0;
  private loginAnswer: LoginResult | Pending<LoginResult> = {
    ok: true,
    value: ANA,
  };
  private meAnswer: AuthResult<AuthUserDto | null> | Pending<AuthResult<AuthUserDto | null>> = {
    ok: true,
    value: null,
  };

  constructor(private readonly journal: CallJournal = new CallJournal()) {}

  answerLoginWith(result: LoginResult): this {
    this.loginAnswer = result;
    return this;
  }

  /** Keeps the next logins waiting; call the returned function to answer them. */
  holdLogin(): (result: LoginResult) => void {
    const held = pending<LoginResult>();
    this.loginAnswer = held;
    return held.resolve;
  }

  /** The next answers of the second step, in order; once used up, the code goes through as ANA. */
  answerTwoFactorWith(...results: TwoFactorLoginResult[]): this {
    this.twoFactorAnswers = results;
    return this;
  }

  answerMeWith(user: AuthUserDto | null): this {
    this.meAnswer = { ok: true, value: user };
    return this;
  }

  holdMe(): (user: AuthUserDto | null) => void {
    const held = pending<AuthResult<AuthUserDto | null>>();
    this.meAnswer = held;
    return (user) => held.resolve({ ok: true, value: user });
  }

  async login(credentials: LoginRequestDto): Promise<LoginResult> {
    this.loginCalls.push(credentials);
    return 'promise' in this.loginAnswer ? this.loginAnswer.promise : this.loginAnswer;
  }

  async verifyTwoFactor(input: TwoFactorLoginRequestDto): Promise<TwoFactorLoginResult> {
    this.twoFactorCalls.push(input);
    return this.twoFactorAnswers.shift() ?? { ok: true, value: ANA };
  }

  async me(): Promise<AuthResult<AuthUserDto | null>> {
    return 'promise' in this.meAnswer ? this.meAnswer.promise : this.meAnswer;
  }

  async logout(): Promise<AuthResult<null>> {
    this.logoutCalls += 1;
    this.journal.entries.push('logout');
    return { ok: true, value: null };
  }
}
