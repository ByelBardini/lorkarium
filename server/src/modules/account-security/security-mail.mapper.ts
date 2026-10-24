import type { MailMessage } from './mailer.port';

// The product speaks pt-BR; the server keeps no time zone per person, so São Paulo is the default.
const WHEN = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const NOT_YOU =
  'Se não foi você, troque sua senha agora em Minha conta e encerre as sessões que não reconhece.';

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Notice to the account's address after its password changed.
 *
 *  Example: `passwordChangedMail('ana@x.com', clock.now()).subject // 'Sua senha foi trocada'` */
export function passwordChangedMail(to: string, at: Date): MailMessage {
  const lines = [
    `A senha da sua conta Lorkarium foi trocada em ${WHEN.format(at)}.`,
    'Os outros aparelhos conectados saíram da conta.',
  ];
  return securityNotice(to, 'Sua senha foi trocada', lines);
}

/** Notice after 2FA was turned on (`enabled: true`) or off. */
export function twoFactorChangedMail(to: string, enabled: boolean, at: Date): MailMessage {
  const state = enabled ? 'ligada' : 'desligada';
  const lines = [`A verificação em duas etapas da sua conta foi ${state} em ${WHEN.format(at)}.`];
  return securityNotice(to, `Verificação em duas etapas ${state}`, lines);
}

/** Notice to the current address that a change to `maskedNewEmail` was asked. */
export function emailChangeRequestedMail(
  to: string,
  maskedNewEmail: string,
  at: Date,
): MailMessage {
  const lines = [
    `Em ${WHEN.format(at)} foi pedida a troca do e-mail da sua conta para ${maskedNewEmail}.`,
    'A troca só vale depois que alguém clicar no link enviado ao endereço novo.',
  ];
  return securityNotice(to, 'Pedido de troca de e-mail', lines);
}

/** Notice to the old address that the e-mail is now `maskedNewEmail`. */
export function emailChangedMail(to: string, maskedNewEmail: string, at: Date): MailMessage {
  const lines = [
    `O e-mail da sua conta passou a ser ${maskedNewEmail} em ${WHEN.format(at)}.`,
    'Este endereço não entra mais na conta.',
  ];
  return securityNotice(to, 'O e-mail da sua conta foi trocado', lines);
}

/** The confirmation link, to the new address only; the token rides in the fragment.
 *
 *  Example: `emailConfirmationMail('bia@novo.com', 'https://mesa.example.com/account/email/confirm#token=…')` */
export function emailConfirmationMail(to: string, link: string): MailMessage {
  const intro = 'Para usar este endereço na sua conta Lorkarium, confirme pelo link abaixo.';
  const expiry = 'O link vale por 30 minutos e só uma vez.';
  const ignore = 'Se você não pediu a troca, ignore este e-mail: nada muda na conta.';
  return {
    to,
    subject: 'Confirme seu novo e-mail',
    text: [intro, link, expiry, ignore].join('\n\n'),
    html: [
      paragraph(intro),
      `<p><a href="${escapeHtml(link)}">Confirmar novo e-mail</a></p>`,
      paragraph(expiry),
      paragraph(ignore),
    ].join('\n'),
  };
}

function securityNotice(to: string, subject: string, lines: readonly string[]): MailMessage {
  const body = [...lines, NOT_YOU];
  return { to, subject, text: body.join('\n\n'), html: body.map(paragraph).join('\n') };
}

function paragraph(line: string): string {
  return `<p>${escapeHtml(line)}</p>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}
