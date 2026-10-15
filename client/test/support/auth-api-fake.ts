import type { AuthUserDto, LoginRequestDto } from '@lorkarium/contracts';
import type { AuthApi, AuthResult } from '@/services/auth-api';

export const ANA: AuthUserDto = {
  id: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01',
  name: 'Ana',
  email: 'ana@mesa.com',
  role: 'user',
};

export const ROOT_ADMIN: AuthUserDto = {
  id: '0b6d2c7e-1a9f-4c3e-8d5b-2f4a6c8e0a12',
  name: 'Admin',
  email: 'root@lorkarium.dev',
  role: 'admin',
};

type Pending<T> = { promise: Promise<T>; resolve: (value: T) => void };

function pending<T>(): Pending<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Scripted `AuthApi`: each call answers what the test set, or waits until the test releases it. */
export class AuthApiFake implements AuthApi {
  readonly loginCalls: LoginRequestDto[] = [];
  logoutCalls = 0;
  private loginAnswer: AuthResult<AuthUserDto> | Pending<AuthResult<AuthUserDto>> = {
    ok: true,
    value: ANA,
  };
  private meAnswer: AuthResult<AuthUserDto | null> | Pending<AuthResult<AuthUserDto | null>> = {
    ok: true,
    value: null,
  };

  answerLoginWith(result: AuthResult<AuthUserDto>): this {
    this.loginAnswer = result;
    return this;
  }

  /** Keeps the next logins waiting; call the returned function to answer them. */
  holdLogin(): (result: AuthResult<AuthUserDto>) => void {
    const held = pending<AuthResult<AuthUserDto>>();
    this.loginAnswer = held;
    return held.resolve;
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

  async login(credentials: LoginRequestDto): Promise<AuthResult<AuthUserDto>> {
    this.loginCalls.push(credentials);
    return 'promise' in this.loginAnswer ? this.loginAnswer.promise : this.loginAnswer;
  }

  async me(): Promise<AuthResult<AuthUserDto | null>> {
    return 'promise' in this.meAnswer ? this.meAnswer.promise : this.meAnswer;
  }

  async logout(): Promise<AuthResult<null>> {
    this.logoutCalls += 1;
    return { ok: true, value: null };
  }
}
