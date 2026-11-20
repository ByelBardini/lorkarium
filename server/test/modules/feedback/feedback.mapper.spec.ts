import { describe, expect, it } from 'vitest';
import {
  issueDraftOf,
  issueLabelsOf,
  toFeedbackEntryDto,
  toNewFeedbackEntryPo,
} from '../../../src/modules/feedback/feedback.mapper';
import { BIA_ID } from '../../support/campaigns-factories';
import { feedbackAttachmentPo, feedbackEntryPo } from '../../support/feedback-fakes';

const SUGGESTION = feedbackEntryPo({
  kind: 'suggestion',
  steps: null,
  expected: null,
  actual: null,
  problem: 'Rolar 1d20 pede três cliques',
  idea: 'Tecla D rola 1d20\nE Shift+D rola com vantagem',
  alternatives: null,
  platform: 'desktop',
  appVersion: 'Lorkarium 0.3.1',
});

describe('issueDraftOf', () => {
  it("a bug reads as GitHub's bug form: its headings, where and the version", () => {
    const draft = issueDraftOf(feedbackEntryPo());

    expect(draft.title).toBe('[bug] O token voltou para a casa de antes');
    expect(draft.body).toBe(
      [
        '### Passos para reproduzir\n\n1. Abri a mesa\n2. Arrastei o token',
        '### O que você esperava\n\nO token andar',
        '### O que aconteceu\n\nO token voltou para a casa de antes',
        '### Onde\n\nNavegador',
        '### Navegador ou versão do app\n\nChrome 142',
        '_Enviado pelo app do Lorkarium e revisado pela equipe._',
      ].join('\n\n'),
    );
  });

  it("a suggestion reads as the suggestion form, the title from the idea's first line, no answer as _No response_", () => {
    const draft = issueDraftOf(SUGGESTION);

    expect(draft.title).toBe('[sugestão] Tecla D rola 1d20');
    expect(draft.body).toContain('### Qual problema isso resolve\n\nRolar 1d20 pede três cliques');
    expect(draft.body).toContain('### Alternativas que você já tentou\n\n_No response_');
    expect(draft.body).not.toContain('Lorkarium 0.3.1');
  });

  it('a long first line is cut to 80 characters with an ellipsis', () => {
    const draft = issueDraftOf(feedbackEntryPo({ actual: `${'a'.repeat(100)}\nresto` }));

    expect(draft.title).toBe(`[bug] ${'a'.repeat(79)}…`);
  });

  it("never carries the sender's @", () => {
    const draft = issueDraftOf(feedbackEntryPo({ senderUsername: 'biaflor' }));

    expect(`${draft.title}${draft.body}`).not.toContain('biaflor');
  });
});

describe('the feedback rows', () => {
  it('a bug request becomes a row with only its own sections', () => {
    const row = toNewFeedbackEntryPo(BIA_ID, 'bia', {
      content: { kind: 'bug', steps: 's', expected: 'e', actual: 'a' },
      platform: 'browser',
      appVersion: 'Chrome 142',
    });

    expect(row).toEqual({
      senderId: BIA_ID,
      senderUsername: 'bia',
      platform: 'browser',
      appVersion: 'Chrome 142',
      kind: 'bug',
      steps: 's',
      expected: 'e',
      actual: 'a',
    });
  });

  it('the queue shows the sections, the sender, the screenshots and the draft', () => {
    const entry = feedbackEntryPo();
    const shot = feedbackAttachmentPo({ feedbackId: entry.id });

    expect(toFeedbackEntryDto(entry, [shot])).toMatchObject({
      id: entry.id,
      content: { kind: 'bug', expected: 'O token andar' },
      sender: { id: entry.senderId, username: 'bia' },
      attachments: [
        { id: shot.id, mimeType: 'image/webp', width: 800, height: 600, sizeBytes: 900 },
      ],
      draft: { title: '[bug] O token voltou para a casa de antes' },
      createdAt: '2026-11-19T12:00:00.000Z',
    });
  });

  it('a bug is labelled bug and a suggestion enhancement, both via-app', () => {
    expect(issueLabelsOf('bug')).toEqual(['bug', 'via-app']);
    expect(issueLabelsOf('suggestion')).toEqual(['enhancement', 'via-app']);
  });
});
