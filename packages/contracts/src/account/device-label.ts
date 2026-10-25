import type { AccountSessionBrowserDto, AccountSessionOsDto } from './account-security.dto';

const BROWSER_NAME: Readonly<Record<AccountSessionBrowserDto, string | null>> = {
  lorkarium: 'Lorkarium',
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  safari: 'Safari',
  opera: 'Opera',
  other: null,
};

const OS_NAME: Readonly<Record<AccountSessionOsDto, string | null>> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
  other: null,
};

/** The line that names a signed-in device: browser and system, whichever the server could read.
 *
 *  The desktop app is an app, not a browser: it reads "Lorkarium para Windows".
 *
 *  Example: `deviceLabel({ browser: 'chrome', os: 'windows' }) // 'Chrome no Windows'` */
export function deviceLabel(
  device: Readonly<{ browser: AccountSessionBrowserDto; os: AccountSessionOsDto }>,
): string {
  const browser = BROWSER_NAME[device.browser];
  const os = OS_NAME[device.os];
  const preposition = device.browser === 'lorkarium' ? 'para' : 'no';
  if (browser && os) return `${browser} ${preposition} ${os}`;
  if (browser) return browser;
  if (os) return `Navegador no ${os}`;
  return 'Navegador desconhecido';
}
