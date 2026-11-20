import { screenshotResponseDto, type ScreenshotDto } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { MailerFake } from './account-security-fakes';
import { IssueTrackerFake } from './feedback-fakes';
import { pngOf } from './images';
import { signUpAndLogin, type SignedInUser } from './sign-in';
import { openTestDatabase, truncateAllTables } from './test-database';

/** Bia and Caio play, Root is the admin; the app opens issues on `tracker` and mails through
 *  `mailer`. Fields are set by the hooks `useFeedbackLive` registers, so read them inside an `it`. */
export class FeedbackLive {
  bia!: SignedInUser;
  caio!: SignedInUser;
  root!: SignedInUser;
  connection!: DatabaseConnection;
  tracker = new IssueTrackerFake();
  mailer = new MailerFake();
  private app!: FastifyInstance;

  async seed(): Promise<void> {
    await truncateAllTables(this.connection.db);
    this.tracker = new IssueTrackerFake();
    this.mailer = new MailerFake();
    const env = { ...readEnv(process.env), adminSeed: null };
    const deps = { env, db: this.connection.db, issueTracker: this.tracker, mailer: this.mailer };
    this.app = await buildApp(deps);
    this.bia = await signUpAndLogin(this.app, this.connection.db, 'Bia');
    this.caio = await signUpAndLogin(this.app, this.connection.db, 'Caio');
    this.root = await signUpAndLogin(this.app, this.connection.db, 'Root');
    await this.connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, this.root.id));
  }

  stop(): Promise<void> {
    return this.app.close();
  }

  /** Calls the real HTTP edge as `user`; `null` sends no session cookie. */
  http(user: SignedInUser | null, request: InjectOptions): Promise<LightMyRequestResponse> {
    const session = user ? { cookies: { lk_session: user.token } } : {};
    return this.app.inject({ ...request, ...session });
  }

  sendShot(
    user: SignedInUser | null,
    body: Buffer,
    contentType = 'image/png',
  ): Promise<LightMyRequestResponse> {
    const headers = { 'content-type': contentType };
    return this.http(user, {
      method: 'POST',
      url: '/api/feedback/attachments',
      headers,
      payload: body,
    });
  }

  async shotOf(user: SignedInUser, body?: Buffer): Promise<ScreenshotDto> {
    const response = await this.sendShot(user, body ?? (await pngOf(320, 200)));
    if (response.statusCode !== 201) throw new Error(`screenshot answered ${response.body}`);
    return screenshotResponseDto.parse(response.json()).attachment;
  }
}

/** Registers the hooks of a feedback spec and hands back the harness.
 *
 *  Example: `const live = useFeedbackLive(); it('…', () => live.http(live.bia, request))` */
export function useFeedbackLive(): FeedbackLive {
  const live = new FeedbackLive();
  beforeAll(async () => {
    live.connection = await openTestDatabase();
  });
  afterAll(() => live.connection.close());
  beforeEach(() => live.seed());
  afterEach(() => live.stop());
  return live;
}
