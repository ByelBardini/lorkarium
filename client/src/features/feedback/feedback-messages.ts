import type { FeedbackKind, FeedbackPlatform } from '@lorkarium/contracts';
import type { FeedbackFailure } from '@/services/feedback-api';

/** One text section of the form, in the order of the repository's issue forms. */
export type FeedbackSectionKey =
  'steps' | 'expected' | 'actual' | 'problem' | 'idea' | 'alternatives';

export type FeedbackSection = Readonly<{
  key: FeedbackSectionKey;
  label: string;
  required: boolean;
}>;

export const FEEDBACK_KIND_LABEL: Readonly<Record<FeedbackKind, string>> = {
  bug: 'Relatar um bug',
  suggestion: 'Sugerir uma melhoria',
};

export const FEEDBACK_PLATFORM_LABEL: Readonly<Record<FeedbackPlatform, string>> = {
  browser: 'Navegador',
  desktop: 'App para Windows',
};

/** The sections each kind asks for (`bug.yml`, `sugestao.yml`). */
export const FEEDBACK_SECTIONS: Readonly<Record<FeedbackKind, readonly FeedbackSection[]>> = {
  bug: [
    { key: 'steps', label: 'Passos para reproduzir', required: true },
    { key: 'expected', label: 'O que você esperava', required: true },
    { key: 'actual', label: 'O que aconteceu', required: true },
  ],
  suggestion: [
    { key: 'problem', label: 'Qual problema isso resolve', required: true },
    { key: 'idea', label: 'A sua ideia', required: true },
    { key: 'alternatives', label: 'Alternativas que você já tentou (opcional)', required: false },
  ],
};

export const FEEDBACK_SENT_TEXT =
  'Recebemos seu relato. Se ele virar uma issue no GitHub, você recebe o link por e-mail.';
export const FEEDBACK_PRIVACY_TEXT =
  'Não escreva dados pessoais: a equipe revisa o texto e pode publicar uma versão dele no GitHub, que é público. Os prints ficam só com a equipe.';
export const FEEDBACK_REQUIRED_TEXT = 'Preencha este campo.';
export const FEEDBACK_SHOTS_LIMIT_TEXT = 'Até 5 prints por relato.';

const FAILURE_TEXT: Partial<Record<FeedbackFailure['kind'], string>> = {
  open_limit: 'Você já tem 10 relatos esperando análise. Espere a equipe olhar algum deles.',
  attachment_not_found: 'Um dos prints não foi encontrado. Remova e anexe de novo.',
  forbidden: 'Sua conta não pode enviar relatos agora.',
  invalid: 'Confira os campos e tente de novo.',
  unauthenticated: 'Sua sessão terminou. Entre de novo para enviar.',
  offline: 'Sem conexão com o servidor. Tente de novo.',
};

/** Why the feedback did not go (pt-BR), above the button.
 *
 *  Example: `feedbackFailureText({ kind: 'open_limit' })` */
export function feedbackFailureText(failure: FeedbackFailure): string {
  if (failure.kind === 'rate_limited') {
    const minutes = Math.max(1, Math.ceil(failure.retryAfterSeconds / 60));
    return `Muitos relatos seguidos. Tente de novo em ${minutes} min.`;
  }
  return FAILURE_TEXT[failure.kind] ?? 'Não deu para enviar agora. Tente de novo.';
}
