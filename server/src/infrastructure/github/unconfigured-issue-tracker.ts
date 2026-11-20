import { IssueTrackerNotConfiguredError } from '../../modules/feedback/feedback.error';
import type { CreatedIssue, IssueTrackerPort } from '../../modules/feedback/issue-tracker.port';

/** The tracker of a server without the GitHub App variables: every publish is refused, so the
 *  queue and the archive keep working in dev and e2e.
 *
 *  Example: `await new UnconfiguredIssueTracker().create(issue) // throws IssueTrackerNotConfiguredError` */
export class UnconfiguredIssueTracker implements IssueTrackerPort {
  async create(): Promise<CreatedIssue> {
    throw new IssueTrackerNotConfiguredError();
  }
}
