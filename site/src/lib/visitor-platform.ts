export type VisitorPlatform = 'windows' | 'mac' | 'linux' | 'mobile' | 'unknown';

export interface VisitorSignals {
  userAgent: string;
  maxTouchPoints: number;
}

// Order matters: Android says "Linux" and iOS says "Mac OS X", so mobile is tested first.
const PLATFORM_PATTERNS: ReadonlyArray<readonly [VisitorPlatform, RegExp]> = [
  ['mobile', /Android|iPhone|iPad|iPod|Mobile/],
  ['windows', /Windows/],
  ['mac', /Macintosh|Mac OS X/],
  ['linux', /Linux|X11/],
];

/**
 * The visitor's operating system family, from what the browser exposes.
 * Example: `visitorPlatformOf({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }) // 'windows'`
 */
export function visitorPlatformOf({ userAgent, maxTouchPoints }: VisitorSignals): VisitorPlatform {
  const platform =
    PLATFORM_PATTERNS.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? 'unknown';
  // iPadOS 13+ sends a desktop Mac user agent; only the touch points give it away.
  if (platform === 'mac' && maxTouchPoints > 1) return 'mobile';
  return platform;
}
