import type { MailIcon, MailTone } from './mail-spec';

export type TonePalette = Readonly<{
  accent: string;
  iconBg: string;
  iconFg: string;
  buttonBg: string;
  buttonFg: string;
}>;

/** The tones of `docs/pages/mails/Emails.dc.html`, value for value. */
export const MAIL_TONES: Readonly<Record<MailTone, TonePalette>> = {
  gold: {
    accent: '#C5A46D',
    iconBg: '#EFE3CB',
    iconFg: '#8A6B2F',
    buttonBg: '#C5A46D',
    buttonFg: '#15130F',
  },
  dark: {
    accent: '#C5A46D',
    iconBg: '#E6E2DA',
    iconFg: '#101216',
    buttonBg: '#101216',
    buttonFg: '#E2C793',
  },
  alert: {
    accent: '#C9705A',
    iconBg: '#F4DCD3',
    iconFg: '#A4472F',
    buttonBg: '#A4472F',
    buttonFg: '#FFF5F0',
  },
  ok: {
    accent: '#8FB39A',
    iconBg: '#DCEADF',
    iconFg: '#3F6A4C',
    buttonBg: '#101216',
    buttonFg: '#E2C793',
  },
};

export const MAIL_COLORS = {
  page: '#EDE7DB',
  band: '#101216',
  bandText: '#EAE5DA',
  body: '#F6F2EA',
  heading: '#101216',
  text: '#3A3D44',
  muted: '#6B6559',
  key: '#7A7468',
  detailsBg: '#FBF9F4',
  detailsBorder: '#E2DACA',
  detailsRule: '#ECE5D6',
  link: '#8A6B2F',
  warningBg: '#F7E6E0',
  warningBorder: '#E8C2B6',
  warningText: '#5E2A1D',
} as const;

// Gmail drops the webfont <link>; the fallbacks are what most readers see.
export const MAIL_FONTS = {
  display: "'Cormorant Garamond', Georgia, serif",
  brand: 'Cinzel, Georgia, serif',
  body: "'Hanken Grotesk', Arial, Helvetica, sans-serif",
  mono: 'ui-monospace, Menlo, Consolas, monospace',
} as const;

export const MAIL_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@600&family=Cormorant+Garamond:wght@600&family=Hanken+Grotesk:wght@400;600;700&display=swap';

const ICON_FILE: Readonly<Record<MailIcon, string>> = {
  mailSwap: 'mail-swap',
  check: 'check',
  lock: 'lock',
  shield: 'shield',
  shieldOff: 'shield-off',
  user: 'user',
  key: 'key',
  pause: 'pause',
};

/** Where the PNG of an icon in a tone is served from.
 *
 *  Example: `iconUrl('https://mesa.example.com', 'mailSwap', 'gold') // '…/email/icon-mail-swap-gold.png'` */
export function iconUrl(publicUrl: string, icon: MailIcon, tone: MailTone): string {
  return `${publicUrl}/email/icon-${ICON_FILE[icon]}-${tone}.png`;
}

/** Example: `markUrl('https://mesa.example.com') // '…/email/lorkarium-mark.png'` */
export function markUrl(publicUrl: string): string {
  return `${publicUrl}/email/lorkarium-mark.png`;
}
