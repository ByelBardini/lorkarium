import type { FeedbackKind, FeedbackPlatform, FeedbackRequestDto } from '@lorkarium/contracts';
import type { FeedbackWhere } from '@/lib/feedback-platform';
import { FEEDBACK_SECTIONS, type FeedbackSectionKey } from './feedback-messages';

/** What the form holds while the person writes: every section of both kinds (switching keeps the
 *  text), where it happened and the version. */
export type FeedbackDraft = Readonly<{
  kind: FeedbackKind;
  sections: Readonly<Record<FeedbackSectionKey, string>>;
  platform: FeedbackPlatform;
  appVersion: string;
}>;

/** The draft a new form starts with: a bug, empty sections, where the app detected.
 *
 *  Example: `emptyFeedbackDraft(feedbackWhereOf(navigator.userAgent)).kind // 'bug'` */
export function emptyFeedbackDraft(where: FeedbackWhere): FeedbackDraft {
  const sections = { steps: '', expected: '', actual: '', problem: '', idea: '', alternatives: '' };
  return { kind: 'bug', sections, ...where };
}

/** The first field of the draft's kind left blank, or `null` when it can go; the version too.
 *
 *  Example: `firstMissingOf(emptyFeedbackDraft(where)) // 'steps'` */
export function firstMissingOf(draft: FeedbackDraft): FeedbackSectionKey | 'appVersion' | null {
  const missing = FEEDBACK_SECTIONS[draft.kind].find(
    (section) => section.required && draft.sections[section.key].trim() === '',
  );
  if (missing) return missing.key;
  return draft.appVersion.trim() === '' ? 'appVersion' : null;
}

/** The request of a complete draft: only the sections of its kind, and the screenshots sent first.
 *
 *  Example: `feedbackRequestOf(draft, [shotId]).content.kind // 'bug'` */
export function feedbackRequestOf(
  draft: FeedbackDraft,
  attachmentIds: readonly string[],
): FeedbackRequestDto {
  const { sections, platform, appVersion } = draft;
  const shots = attachmentIds.length > 0 ? { attachmentIds: [...attachmentIds] } : {};
  return { content: contentOf(draft.kind, sections), platform, appVersion, ...shots };
}

function contentOf(
  kind: FeedbackKind,
  sections: FeedbackDraft['sections'],
): FeedbackRequestDto['content'] {
  if (kind === 'bug') {
    return { kind, steps: sections.steps, expected: sections.expected, actual: sections.actual };
  }
  const alternatives = sections.alternatives.trim() || null;
  return { kind, problem: sections.problem, idea: sections.idea, alternatives };
}
