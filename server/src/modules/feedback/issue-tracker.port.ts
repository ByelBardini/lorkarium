/** An issue as the tracker receives it: the admin's title and body, and the labels. */
export type NewIssue = Readonly<{ title: string; body: string; labels: readonly string[] }>;

/** The issue that now exists: its public link and number. */
export type CreatedIssue = Readonly<{ url: string; number: number }>;

/** Where a published feedback entry becomes a public issue (GitHub, in production).
 *
 *  Example: `await tracker.create({ title, body, labels: ['bug', 'via-app'] }) // { url, number: 42 }` */
export interface IssueTrackerPort {
  create(issue: NewIssue): Promise<CreatedIssue>;
}
