import { mailBroadcastContentDto, type MailBroadcastContentDto } from '@lorkarium/contracts';
import type { BroadcastsFailure } from '@/services/broadcasts-api';
import { paragraphsOf, segmentOf, type SegmentChoice } from './broadcast-view';

/** What the editor holds, as typed. */
export type BroadcastFields = Readonly<{
  choice: SegmentChoice;
  subject: string;
  title: string;
  text: string;
  buttonLabel: string;
  buttonHref: string;
}>;

export type BroadcastContentCheck =
  | Readonly<{ ok: true; content: MailBroadcastContentDto }>
  | Readonly<{ ok: false; message: string }>;

// The first field the contract refuses says what to fix; the order is the form's.
const FIELD_MESSAGE: Readonly<Record<string, string>> = {
  subject: 'O assunto vai de 1 a 120 caracteres.',
  title: 'O título vai de 1 a 80 caracteres.',
  paragraphs: 'Escreva de 1 a 20 parágrafos, separados por uma linha em branco.',
  'button.label': 'O botão precisa de um texto de até 40 caracteres.',
  'button.href': 'O link do botão precisa começar com https://.',
};

/** The fields as the contract's content, or the sentence of the first field to fix. A button
 *  with neither text nor link is no button.
 *
 *  Example: `contentCheckOf(fields) // { ok: true, content: { segment: 'all', … } }` */
export function contentCheckOf(fields: BroadcastFields): BroadcastContentCheck {
  const { buttonLabel, buttonHref } = fields;
  const button =
    buttonLabel.trim() || buttonHref.trim() ? { label: buttonLabel, href: buttonHref } : undefined;
  const parsed = mailBroadcastContentDto.safeParse({
    segment: segmentOf(fields.choice),
    subject: fields.subject,
    title: fields.title,
    paragraphs: paragraphsOf(fields.text),
    ...(button ? { button } : {}),
  });
  if (parsed.success) return { ok: true, content: parsed.data };
  const path = parsed.error.issues[0]?.path.filter((key) => typeof key === 'string').join('.');
  return { ok: false, message: FIELD_MESSAGE[path ?? ''] ?? 'Confira os campos do comunicado.' };
}

const MESSAGE: Readonly<Record<Exclude<BroadcastsFailure['kind'], 'rate_limited'>, string>> = {
  unauthenticated: 'Sua sessão terminou. Entre de novo para continuar.',
  forbidden: 'Você não tem mais acesso ao backoffice.',
  not_found: 'Este rascunho não existe mais. Recarregue a página.',
  already_confirmed: 'Este comunicado já foi enviado.',
  test_required: 'Envie um teste para você antes de enviar para todos.',
  two_factor_required: 'Ative a verificação em duas etapas da sua conta para enviar um comunicado.',
  confirmation_mismatch:
    'O número de contas mudou desde a prévia. Confira o novo total e digite de novo.',
  mail_delivery_failed:
    'O servidor de e-mail recusou ou não respondeu. Confira o SMTP_URL do server e tente de novo.',
  invalid: 'Confira os campos do comunicado.',
  offline: 'Sem conexão com o servidor. Confira a internet e tente de novo.',
  unexpected: 'Algo deu errado. Tente de novo.',
};

/** Example: `broadcastFailureMessage({ kind: 'test_required' }) // 'Envie um teste…'` */
export function broadcastFailureMessage(failure: BroadcastsFailure): string {
  if (failure.kind === 'rate_limited')
    return `Muitos testes seguidos. Tente de novo em ${failure.retryAfterSeconds} s.`;
  return MESSAGE[failure.kind];
}
