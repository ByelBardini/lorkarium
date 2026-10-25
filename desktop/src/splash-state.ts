import type { ShellEvent } from './shell-events';

export type SplashProgress =
  { kind: 'none' } | { kind: 'indeterminate' } | { kind: 'determinate'; percent: number };

export type SplashView = {
  title: string;
  detail: string | null;
  progress: SplashProgress;
  canRetry: boolean;
};

const NO_PROGRESS: SplashProgress = { kind: 'none' };

function waiting(title: string, detail: string | null = null): SplashView {
  return { title, detail, progress: NO_PROGRESS, canRetry: false };
}

function stuck(title: string, detail: string): SplashView {
  return { title, detail, progress: NO_PROGRESS, canRetry: true };
}

export const INITIAL_SPLASH_VIEW: SplashView = waiting('Procurando atualizações…');

function downloadProgress(downloaded: number, total: number | null): SplashProgress {
  if (total === null || total <= 0) return { kind: 'indeterminate' };
  const percent = Math.min(100, Math.floor((downloaded / total) * 100));
  return { kind: 'determinate', percent };
}

/** What the splash shows after an event from the shell; an unreadable event (`null`) keeps the screen as it was.
 *
 *  Example: `splashViewOf(INITIAL_SPLASH_VIEW, { kind: 'offline' }).canRetry // true` */
export function splashViewOf(previous: SplashView, event: ShellEvent | null): SplashView {
  if (event === null) return previous;
  switch (event.kind) {
    case 'checking-update':
      return INITIAL_SPLASH_VIEW;
    case 'downloading':
      return {
        ...waiting('Baixando atualização'),
        progress: downloadProgress(event.downloaded, event.total),
      };
    case 'installing':
      return {
        ...waiting('Instalando…', 'O Lorkarium vai reabrir sozinho.'),
        progress: { kind: 'indeterminate' },
      };
    case 'connecting':
      return waiting('Conectando…');
    case 'server-unavailable':
      return stuck('O Lorkarium está em manutenção', 'Tente de novo em alguns minutos.');
    case 'offline':
      return stuck('Sem conexão', 'Confira a internet e tente de novo.');
  }
}
