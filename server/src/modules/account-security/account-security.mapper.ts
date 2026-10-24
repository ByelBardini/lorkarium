import type {
  AccountSecurityDto,
  AccountSessionBrowserDto,
  AccountSessionDto,
  AccountSessionFormFactorDto,
  AccountSessionOsDto,
} from '@lorkarium/contracts';
import type { AuthSessionPo } from '../auth/auth-sessions.po';

export type SessionDevice = Readonly<{
  browser: AccountSessionBrowserDto;
  os: AccountSessionOsDto;
  formFactor: AccountSessionFormFactorDto;
}>;

// Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
const BROWSER_PATTERNS: ReadonlyArray<readonly [AccountSessionBrowserDto, RegExp]> = [
  ['edge', /\bEdg(e|A|iOS)?\//],
  ['opera', /\b(OPR|Opera)\//],
  ['firefox', /\b(Firefox|FxiOS)\//],
  ['chrome', /\b(Chrome|CriOS|Chromium)\//],
  ['safari', /\bVersion\/[\d.]+.*\bSafari\//],
];

// Order matters: iOS says "like Mac OS X", Android says "Linux".
const OS_PATTERNS: ReadonlyArray<readonly [AccountSessionOsDto, RegExp]> = [
  ['ios', /\b(iPhone|iPad|iPod)\b/],
  ['android', /\bAndroid\b/],
  ['windows', /\bWindows\b/],
  ['macos', /\b(Macintosh|Mac OS X)\b/],
  ['linux', /\b(Linux|X11|CrOS)\b/],
];

const MOBILE_OS: ReadonlySet<AccountSessionOsDto> = new Set(['ios', 'android']);

/** The user agent read into browser family, system and form factor (no version is kept); an
 *  empty agent or a non-browser (`curl/8`) is `other` all along.
 *
 *  Example: `deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) … Chrome/130.0 Safari/537.36') // chrome, windows, desktop` */
export function deviceOf(userAgent: string | null): SessionDevice {
  const agent = userAgent ?? '';
  const os = firstMatch(OS_PATTERNS, agent);
  return { browser: firstMatch(BROWSER_PATTERNS, agent), os, formFactor: formFactorOf(os, agent) };
}

function firstMatch<T extends string>(
  patterns: ReadonlyArray<readonly [T, RegExp]>,
  agent: string,
): T | 'other' {
  return patterns.find(([, pattern]) => pattern.test(agent))?.[0] ?? 'other';
}

function formFactorOf(os: AccountSessionOsDto, agent: string): AccountSessionFormFactorDto {
  if (MOBILE_OS.has(os) || /\bMobi/.test(agent)) return 'mobile';
  return os === 'other' ? 'other' : 'desktop';
}

/** PO → DTO of one signed-in device; the token hash never leaves, only the public id.
 *
 *  Example: `toAccountSessionDto(row, sessionIdOf(request)).current // true for this device` */
export function toAccountSessionDto(
  row: AuthSessionPo,
  currentSessionId: string,
): AccountSessionDto {
  return {
    id: row.publicId,
    ...deviceOf(row.userAgent),
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    current: row.id === currentSessionId,
  };
}

export type AccountSecurityFacts = Readonly<{
  email: string;
  passwordChangedAt: Date | null;
  pendingEmail: string | null;
  twoFactorEnabled: boolean;
  recoveryCodesLeft: number;
}>;

/** The facts of the "Conta e segurança" section → its DTO (`pendingEmail` already masked).
 *
 *  Example: `toAccountSecurityDto({ email, passwordChangedAt: null, … }).twoFactor.enabled` */
export function toAccountSecurityDto(facts: AccountSecurityFacts): AccountSecurityDto {
  return {
    email: facts.email,
    passwordChangedAt: facts.passwordChangedAt?.toISOString() ?? null,
    pendingEmail: facts.pendingEmail,
    twoFactor: { enabled: facts.twoFactorEnabled, recoveryCodesLeft: facts.recoveryCodesLeft },
  };
}
