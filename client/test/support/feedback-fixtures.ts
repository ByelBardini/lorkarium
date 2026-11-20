import type { FeedbackEntryDto, FeedbackRequestDto, ScreenshotDto } from '@lorkarium/contracts';

export const FEEDBACK_SHOT: ScreenshotDto = {
  id: '00000000-0000-4000-8000-0000000000f1',
  mimeType: 'image/webp',
  width: 800,
  height: 600,
  sizeBytes: 900,
};

export const BUG_REQUEST: FeedbackRequestDto = {
  content: {
    kind: 'bug',
    steps: 'Abri a mesa',
    expected: 'O token andar',
    actual: 'O token voltou',
  },
  platform: 'browser',
  appVersion: 'Chrome 142',
};

/** A bug of Bia with one screenshot, waiting in the queue. */
export const TOKEN_BUG: FeedbackEntryDto = {
  id: '00000000-0000-4000-8000-0000000000e1',
  content: {
    kind: 'bug',
    steps: 'Abri a mesa\nArrastei o token',
    expected: 'O token andar',
    actual: 'O token voltou',
  },
  platform: 'browser',
  appVersion: 'Chrome 142',
  sender: { id: '00000000-0000-4000-8000-000000000b1a', username: 'bia' },
  attachments: [FEEDBACK_SHOT],
  draft: {
    title: '[bug] O token voltou',
    body: '### Passos para reproduzir\n\nAbri a mesa\nArrastei o token',
  },
  createdAt: '2026-11-19T12:00:00.000Z',
};

/** A suggestion of Caio from the Windows app, without screenshots. */
export const DICE_SUGGESTION: FeedbackEntryDto = {
  id: '00000000-0000-4000-8000-0000000000e2',
  content: {
    kind: 'suggestion',
    problem: 'Rolar 1d20 pede três cliques',
    idea: 'Tecla D rola 1d20',
    alternatives: null,
  },
  platform: 'desktop',
  appVersion: 'Lorkarium 0.3.1',
  sender: { id: '00000000-0000-4000-8000-000000000ca1', username: 'caio' },
  attachments: [],
  draft: {
    title: '[sugestão] Tecla D rola 1d20',
    body: '### Qual problema isso resolve\n\nRolar 1d20',
  },
  createdAt: '2026-11-19T13:00:00.000Z',
};
