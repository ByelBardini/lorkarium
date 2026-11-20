import type {
  FeedbackContentDto,
  FeedbackEntryDto,
  FeedbackIssueDraftDto,
  FeedbackRequestDto,
} from '@lorkarium/contracts';
import { FEEDBACK_ISSUE_TITLE_MAX_LENGTH } from '@lorkarium/contracts';
import { screenshotDtoOf, type KeptScreenshot } from '../assets/screenshot-upload';
import type { FeedbackAttachmentPo, NewFeedbackAttachmentPo } from './feedback-attachments.po';
import type { FeedbackEntryPo, NewFeedbackEntryPo } from './feedback-entries.po';

// A title is read in a list: the first line of what happened, cut to a glance.
const TITLE_SUMMARY_MAX = 80;
const PLATFORM_LABEL: Readonly<Record<FeedbackEntryPo['platform'], string>> = {
  browser: 'Navegador',
  desktop: 'App para Windows',
};
const LABELS: Readonly<Record<FeedbackEntryPo['kind'], readonly string[]>> = {
  bug: ['bug', 'via-app'],
  suggestion: ['enhancement', 'via-app'],
};
const NO_RESPONSE = '_No response_';
const SIGNATURE = '_Enviado pelo app do Lorkarium e revisado pela equipe._';

/** The bucket key of a feedback screenshot: never a file name, always under `feedback/`.
 *
 *  Example: `feedbackAttachmentKeyOf(id) // 'feedback/<id>'` */
export function feedbackAttachmentKeyOf(attachmentId: string): string {
  return `feedback/${attachmentId}`;
}

/** The row of a new entry, with the sender's @ of now.
 *
 *  Example: `toNewFeedbackEntryPo(biaId, 'bia', request).kind // 'bug'` */
export function toNewFeedbackEntryPo(
  senderId: string,
  senderUsername: string,
  request: FeedbackRequestDto,
): NewFeedbackEntryPo {
  const { platform, appVersion, content } = request;
  return { senderId, senderUsername, platform, appVersion, ...content };
}

/** Example: `toNewFeedbackAttachmentPo({ attachmentId, uploaderId: biaId, kept })` */
export function toNewFeedbackAttachmentPo(
  input: Readonly<{ attachmentId: string; uploaderId: string; kept: KeptScreenshot }>,
): NewFeedbackAttachmentPo {
  const { attachmentId, kept } = input;
  return {
    id: attachmentId,
    feedbackId: null,
    uploadedBy: input.uploaderId,
    storageKey: feedbackAttachmentKeyOf(attachmentId),
    mimeType: kept.mimeType,
    sizeBytes: kept.image.bytes.byteLength,
    width: kept.image.width,
    height: kept.image.height,
  };
}

/** The sections of a row, as the request had them.
 *
 *  Example: `contentOf(row) // { kind: 'bug', steps, expected, actual }` */
export function contentOf(row: FeedbackEntryPo): FeedbackContentDto {
  if (row.kind === 'bug') {
    return {
      kind: 'bug',
      steps: textOf(row.steps),
      expected: textOf(row.expected),
      actual: textOf(row.actual),
    };
  }
  return {
    kind: 'suggestion',
    problem: textOf(row.problem),
    idea: textOf(row.idea),
    alternatives: row.alternatives,
  };
}

function textOf(section: string | null): string {
  return section ?? '';
}

/** The issue as GitHub's issue forms would have written it: the same headings (`bug.yml`,
 *  `sugestao.yml`), never the sender's @, e-mail or tables.
 *
 *  Example: `issueDraftOf(row).title // '[bug] O token voltou'` */
export function issueDraftOf(row: FeedbackEntryPo): FeedbackIssueDraftDto {
  const content = contentOf(row);
  if (content.kind === 'bug') return bugDraftOf(row, content);
  const sections: Section[] = [
    ['Qual problema isso resolve', content.problem],
    ['A sua ideia', content.idea],
    ['Alternativas que você já tentou', content.alternatives ?? NO_RESPONSE],
  ];
  return { title: titleOf('[sugestão]', content.idea), body: bodyOf(sections) };
}

function bugDraftOf(
  row: FeedbackEntryPo,
  content: Extract<FeedbackContentDto, { kind: 'bug' }>,
): FeedbackIssueDraftDto {
  const sections: Section[] = [
    ['Passos para reproduzir', content.steps],
    ['O que você esperava', content.expected],
    ['O que aconteceu', content.actual],
    ['Onde', PLATFORM_LABEL[row.platform]],
    ['Navegador ou versão do app', row.appVersion],
  ];
  return { title: titleOf('[bug]', content.actual), body: bodyOf(sections) };
}

type Section = readonly [heading: string, text: string];

function bodyOf(sections: readonly Section[]): string {
  const blocks = sections.map(([heading, text]) => `### ${heading}\n\n${text}`);
  return [...blocks, SIGNATURE].join('\n\n');
}

function titleOf(prefix: string, text: string): string {
  const firstLine = (text.split('\n').find((line) => line.trim() !== '') ?? '').trim();
  const summary =
    firstLine.length > TITLE_SUMMARY_MAX
      ? `${firstLine.slice(0, TITLE_SUMMARY_MAX - 1)}…`
      : firstLine;
  return `${prefix} ${summary}`.slice(0, FEEDBACK_ISSUE_TITLE_MAX_LENGTH);
}

/** Example: `issueLabelsOf('bug') // ['bug', 'via-app']` */
export function issueLabelsOf(kind: FeedbackEntryPo['kind']): readonly string[] {
  return LABELS[kind];
}

/** An entry as the backoffice queue shows it, with its screenshots and the issue draft.
 *
 *  Example: `toFeedbackEntryDto(row, shots).draft.title // '[bug] O token voltou'` */
export function toFeedbackEntryDto(
  row: FeedbackEntryPo,
  attachments: readonly FeedbackAttachmentPo[],
): FeedbackEntryDto {
  return {
    id: row.id,
    content: contentOf(row),
    platform: row.platform,
    appVersion: row.appVersion,
    sender: { id: row.senderId, username: row.senderUsername },
    attachments: attachments.map(screenshotDtoOf),
    draft: issueDraftOf(row),
    createdAt: row.createdAt.toISOString(),
  };
}
