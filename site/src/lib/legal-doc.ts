export interface LegalDocDraftState {
  id: string;
  draft: boolean;
}

/**
 * Stops a legal page from shipping while its text is still a draft, unless the build allows drafts.
 * Example: `assertPublishable(entry, LEGAL_DRAFTS_ALLOWED)` in `termos.astro` fails the production build.
 */
export function assertPublishable(doc: LegalDocDraftState, allowDrafts: boolean): void {
  if (!doc.draft || allowDrafts) return;
  throw new Error(
    `src/content/legal/${doc.id}.md is marked "draft: true"; expected "draft: false" ` +
      'with the final text before publishing (or LEGAL_DRAFTS_ALLOWED=true outside production).',
  );
}
