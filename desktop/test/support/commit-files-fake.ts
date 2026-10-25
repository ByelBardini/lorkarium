import type { Commit, GenerateNotesContext } from 'semantic-release';
import type { CommitFiles } from '../../release/desktop-commits';

/** Answers the changed paths of each commit from a table instead of running git. */
export class CommitFilesFake implements CommitFiles {
  private readonly pathsByHash: Readonly<Record<string, readonly string[]>>;

  constructor(pathsByHash: Readonly<Record<string, readonly string[]>>) {
    this.pathsByHash = pathsByHash;
  }

  filesOf(hash: string): readonly string[] {
    const paths = this.pathsByHash[hash];
    if (paths === undefined)
      throw new Error(`CommitFilesFake: commit sem caminhos na tabela: ${hash}`);
    return paths;
  }
}

/** A commit as semantic-release hands it to the plugins; only the hash and the message matter here. */
export function commitOf(hash: string, message: string): Commit {
  const [subject = '', ...rest] = message.split('\n');
  const date = '2026-10-25T12:00:00Z';
  const person = { name: 'Bia', email: 'bia@lorkarium.test', short: date };
  return {
    commit: { long: hash, short: hash.slice(0, 7) },
    tree: { long: hash, short: hash.slice(0, 7) },
    author: person,
    committer: person,
    subject,
    body: rest.join('\n'),
    message,
    hash,
    committerDate: date,
  };
}

/**
 * The step context with just what the conventional-commits plugins read; the rest of the real
 * context (env, branch, options) never reaches them.
 */
export function releaseContextOf(commits: readonly Commit[]): GenerateNotesContext {
  const silent = { log: () => undefined };
  const context = {
    commits,
    cwd: process.cwd(),
    env: {},
    logger: silent,
    options: { repositoryUrl: 'https://github.com/ByelBardini/lorkarium' },
    lastRelease: { version: '1.0.0', gitTag: 'desktop-v1.0.0', gitHead: 'base', channels: [] },
    nextRelease: { type: 'minor', version: '1.1.0', gitTag: 'desktop-v1.1.0', gitHead: 'head' },
  };
  return context as unknown as GenerateNotesContext;
}
