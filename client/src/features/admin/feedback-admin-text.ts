import type { FeedbackContentDto, FeedbackEntryDto, FeedbackKind } from '@lorkarium/contracts';
import type { FeedbackAdminFailure } from '@/services/feedback-admin-api';
import { adminFailureMessage } from './admin-messages';

export const FEEDBACK_KIND_TAG: Readonly<Record<FeedbackKind, string>> = {
  bug: 'Bug',
  suggestion: 'Sugestão',
};

export const FEEDBACK_PLATFORM_TAG: Readonly<Record<FeedbackEntryDto['platform'], string>> = {
  browser: 'Navegador',
  desktop: 'App para Windows',
};

/** The first line of what the entry is about: what happened, or the idea.
 *
 *  Example: `feedbackSummaryOf(entry.content) // 'O token voltou'` */
export function feedbackSummaryOf(content: FeedbackContentDto): string {
  const text = content.kind === 'bug' ? content.actual : content.idea;
  return (
    text
      .split('\n')
      .find((line) => line.trim() !== '')
      ?.trim() ?? ''
  );
}

/** The sections of an entry in the order of its issue form, with their headings. */
export function feedbackSectionsOf(
  content: FeedbackContentDto,
): ReadonlyArray<readonly [string, string]> {
  if (content.kind === 'bug') {
    return [
      ['Passos para reproduzir', content.steps],
      ['O que você esperava', content.expected],
      ['O que aconteceu', content.actual],
    ];
  }
  return [
    ['Qual problema isso resolve', content.problem],
    ['A sua ideia', content.idea],
    ['Alternativas que você já tentou', content.alternatives ?? 'Nenhuma'],
  ];
}

/** "Issue #42 aberta." with the link, after a publish. */
export function publishedNotice(issueNumber: number): string {
  return `Issue #${issueNumber} aberta.`;
}

/** Why a publish or an archive did not happen (pt-BR).
 *
 *  Example: `feedbackAdminFailureText({ kind: 'issue_tracker_unavailable' })` */
export function feedbackAdminFailureText(failure: FeedbackAdminFailure): string {
  if (failure.kind === 'issue_tracker_unavailable') {
    return 'O GitHub não respondeu. O relato continua na fila.';
  }
  if (failure.kind === 'issue_tracker_not_configured') {
    return 'A integração com o GitHub não está configurada no server.';
  }
  if (failure.kind === 'not_found') return 'Esse relato já foi fechado.';
  return adminFailureMessage(failure);
}
