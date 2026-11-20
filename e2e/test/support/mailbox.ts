import { expect } from '@playwright/test';

type MailpitSummary = Readonly<{
  ID: string;
  To: ReadonlyArray<Readonly<{ Address: string }>>;
  Subject: string;
}>;

/** The Mailpit API the e2e server delivers to (E2E_MAILPIT_API_URL); null where the run has no
 *  Mailpit, and the specs that read e-mail skip.
 *
 *  Example: `test.skip(!mailpitApiUrl(), 'needs E2E_SMTP_URL and E2E_MAILPIT_API_URL')` */
export function mailpitApiUrl(): string | null {
  return process.env.E2E_MAILPIT_API_URL || null;
}

/** Waits for the e-mail with this subject sent to this address (the server sends after it answers)
 *  and returns the path and fragment of the first app link in it that starts with `linkPath`.
 *
 *  Example: `await page.goto(await mailedLink('ana@x.com', 'Confirme seu cadastro no Lorkarium', '/sign-up/confirm'))` */
export async function mailedLink(to: string, subject: string, linkPath: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(async () => (id = (await messagesTo(to)).find((m) => m.Subject === subject)?.ID), {
      message: `an e-mail "${subject}" to ${to}`,
      timeout: 15_000,
    })
    .toBeTruthy();
  return linkIn(await textOf(id ?? ''), linkPath);
}

async function messagesTo(address: string): Promise<MailpitSummary[]> {
  const response = await fetch(`${apiUrl()}/api/v1/messages?limit=200`);
  const body = (await response.json()) as { messages: MailpitSummary[] };
  return body.messages.filter((message) => message.To.some((one) => one.Address === address));
}

async function textOf(id: string): Promise<string> {
  const response = await fetch(`${apiUrl()}/api/v1/message/${id}`);
  return ((await response.json()) as { Text: string }).Text;
}

function linkIn(text: string, linkPath: string): string {
  const escaped = linkPath.replace(/[/.]/g, '\\$&');
  const found = new RegExp(`https?://[^\\s/]+(${escaped}#token=[^\\s>"]+)`).exec(text);
  if (!found?.[1]) throw new Error(`no ${linkPath}#token=… link in the e-mail text: ${text}`);
  return found[1];
}

function apiUrl(): string {
  const url = mailpitApiUrl();
  if (!url) throw new Error('reading e-mail needs E2E_MAILPIT_API_URL; received nothing');
  return url;
}
