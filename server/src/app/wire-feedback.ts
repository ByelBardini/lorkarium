import type { FastifyInstance } from 'fastify';
import type { GitHubAppConfig } from '../config/github-env';
import { GitHubAppIssueTracker } from '../infrastructure/github/github-app-issue-tracker';
import { UnconfiguredIssueTracker } from '../infrastructure/github/unconfigured-issue-tracker';
import type { ClockPort } from '../modules/auth/clock.port';
import {
  createFeedbackModule,
  type FeedbackModuleOptions,
} from '../modules/feedback/feedback.plugin';
import type { IssueTrackerPort } from '../modules/feedback/issue-tracker.port';

export type FeedbackWiring = Omit<FeedbackModuleOptions, 'tracker'> &
  Readonly<{
    /** `env.issueTracker`: the App, or null when the server runs without it. */
    github: GitHubAppConfig | null;
    clock: ClockPort;
    /** A spec's own tracker wins over the one of `github`. */
    tracker?: IssueTrackerPort;
  }>;

/** Registers the feedback under `prefix`, with the GitHub App as the tracker when it is set up.
 *
 *  Example: `await wireFeedback(app, { db, storage, processor, notices, cipher, appPublicUrl, github: env.issueTracker, clock }, '/api')` */
export async function wireFeedback(
  app: FastifyInstance,
  wiring: FeedbackWiring,
  prefix: string,
): Promise<void> {
  const { github, clock, tracker, ...options } = wiring;
  const chosen = tracker ?? trackerOf(github, clock);
  await app.register(createFeedbackModule({ ...options, tracker: chosen }).plugin, { prefix });
}

function trackerOf(github: GitHubAppConfig | null, clock: ClockPort): IssueTrackerPort {
  if (github === null) return new UnconfiguredIssueTracker();
  return new GitHubAppIssueTracker({
    config: github,
    fetch: (url, init) => fetch(url, init),
    clock,
  });
}
