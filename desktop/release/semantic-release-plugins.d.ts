// Both plugins ship plain JavaScript without typings; only the step each one exports is declared.
declare module '@semantic-release/commit-analyzer' {
  import type { AnalyzeCommitsContext, ReleaseType } from 'semantic-release';
  export function analyzeCommits(
    pluginConfig: object,
    context: AnalyzeCommitsContext,
  ): Promise<ReleaseType | null>;
}

declare module '@semantic-release/release-notes-generator' {
  import type { GenerateNotesContext } from 'semantic-release';
  export function generateNotes(
    pluginConfig: object,
    context: GenerateNotesContext,
  ): Promise<string>;
}
