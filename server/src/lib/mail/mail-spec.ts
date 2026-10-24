/** The four looks of the mock: gold (transactional), dark (done deal), alert (act now), ok (good news). */
export type MailTone = 'gold' | 'dark' | 'alert' | 'ok';

/** Icons drawn once as PNG in `client/public/email/` (`icon-<kebab>-<tone>.png`). */
export type MailIcon =
  'mailSwap' | 'check' | 'lock' | 'shield' | 'shieldOff' | 'user' | 'key' | 'pause';

export type MailDetail = Readonly<{ label: string; value: string }>;

/** `href` must be absolute: a mail client has no base URL to resolve against. */
export type MailButton = Readonly<{ label: string; href: string }>;

export type MailWarning = Readonly<{ title: string; text: string }>;

/** Everything one e-mail says, block by block, in the mock's order. Optional blocks leave no trace. */
export type MailSpec = Readonly<{
  subject: string;
  preheader: string;
  tone: MailTone;
  icon: MailIcon;
  title: string;
  paragraphs: readonly string[];
  details?: readonly MailDetail[];
  button?: MailButton;
  note?: string;
  warning?: MailWarning;
  /** Repeats the button's URL as text, for clients that break the button. */
  fallbackLink?: boolean;
  footer: readonly string[];
}>;

export type RenderedMail = Readonly<{ html: string; text: string }>;
