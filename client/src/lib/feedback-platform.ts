import type { FeedbackPlatform } from '@lorkarium/contracts';
import { desktopShellOf } from './desktop-shell';

/** Where a feedback comes from, as the form fills it before the person edits it. */
export type FeedbackWhere = Readonly<{ platform: FeedbackPlatform; appVersion: string }>;

// Order matters: Edge and Opera also say Chrome, and Chrome also says Safari.
const BROWSERS: readonly (readonly [name: string, token: RegExp])[] = [
  ['Edge', /Edg\/(\d+)/],
  ['Opera', /OPR\/(\d+)/],
  ['Firefox', /Firefox\/(\d+)/],
  ['Chrome', /Chrome\/(\d+)/],
  ['Safari', /Version\/(\d+)(?:\.\d+)*.*Safari\//],
];

/** The desktop app with its version, or the browser with its major version ("Chrome 142"); an
 *  unknown browser reads just "Navegador".
 *
 *  Example: `feedbackWhereOf(navigator.userAgent) // { platform: 'browser', appVersion: 'Firefox 145' }` */
export function feedbackWhereOf(userAgent: string): FeedbackWhere {
  const shell = desktopShellOf(userAgent);
  if (shell) return { platform: 'desktop', appVersion: `Lorkarium ${shell.version}` };
  return { platform: 'browser', appVersion: browserOf(userAgent) };
}

function browserOf(userAgent: string): string {
  for (const [name, token] of BROWSERS) {
    const major = token.exec(userAgent)?.[1];
    if (major) return `${name} ${major}`;
  }
  return 'Navegador';
}
