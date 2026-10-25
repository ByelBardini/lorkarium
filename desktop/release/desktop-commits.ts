import { execFileSync } from 'node:child_process';
import { analyzeCommits as analyzeConventionalCommits } from '@semantic-release/commit-analyzer';
import { generateNotes as generateConventionalNotes } from '@semantic-release/release-notes-generator';
import type {
  AnalyzeCommitsContext,
  Commit,
  GenerateNotesContext,
  ReleaseType,
} from 'semantic-release';

// The repo is a monorepo and only the Windows shell ships as a release: a feat in the client or
// the server must not bump the installer, since the shell opens the deployed site anyway.
const DESKTOP_PREFIX = 'desktop/';

/** Lists the paths a commit changed; a merge commit lists none (its parents' commits carry the change). */
export interface CommitFiles {
  filesOf(hash: string): readonly string[];
}

/** Reads the changed paths from git, relative to the repository root. */
export class GitCommitFiles implements CommitFiles {
  private readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  filesOf(hash: string): readonly string[] {
    const output = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', hash], {
      cwd: this.cwd,
      encoding: 'utf8',
    });
    return output.split('\n').filter((path) => path !== '');
  }
}

/**
 * Keeps only the commits that changed something under `desktop/`.
 * Example: `keepDesktopCommits(context.commits, new GitCommitFiles(context.cwd))`
 */
export function keepDesktopCommits(
  commits: readonly Commit[],
  files: CommitFiles,
): readonly Commit[] {
  return commits.filter((commit) =>
    files.filesOf(commit.hash).some((path) => path.startsWith(DESKTOP_PREFIX)),
  );
}

export interface DesktopReleaseSteps {
  analyzeCommits(pluginConfig: object, context: AnalyzeCommitsContext): Promise<ReleaseType | null>;
  generateNotes(pluginConfig: object, context: GenerateNotesContext): Promise<string>;
}

/**
 * The conventional-commits analyzer and notes generator, fed only the desktop commits.
 * Example: `await scopedToDesktop(fake).analyzeCommits({ preset: 'conventionalcommits' }, context) // 'minor'`
 */
export function scopedToDesktop(files: CommitFiles): DesktopReleaseSteps {
  return {
    analyzeCommits(
      pluginConfig: object,
      context: AnalyzeCommitsContext,
    ): Promise<ReleaseType | null> {
      const commits = keepDesktopCommits(context.commits, files);
      return analyzeConventionalCommits(pluginConfig, { ...context, commits });
    },
    generateNotes(pluginConfig: object, context: GenerateNotesContext): Promise<string> {
      const commits = keepDesktopCommits(context.commits, files);
      return generateConventionalNotes(pluginConfig, { ...context, commits });
    },
  };
}

/** semantic-release plugin step: the release type from the desktop commits only. */
export function analyzeCommits(
  pluginConfig: object,
  context: AnalyzeCommitsContext,
): Promise<ReleaseType | null> {
  return scopedToDesktop(new GitCommitFiles(context.cwd ?? process.cwd())).analyzeCommits(
    pluginConfig,
    context,
  );
}

/** semantic-release plugin step: release notes listing the desktop commits only. */
export function generateNotes(
  pluginConfig: object,
  context: GenerateNotesContext,
): Promise<string> {
  return scopedToDesktop(new GitCommitFiles(context.cwd ?? process.cwd())).generateNotes(
    pluginConfig,
    context,
  );
}
