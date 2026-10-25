import { describe, expect, it } from 'vitest';
import { INITIAL_SPLASH_VIEW, splashViewOf, type SplashView } from '../src/splash-state';

const OFFLINE_VIEW: SplashView = splashViewOf(INITIAL_SPLASH_VIEW, { kind: 'offline' });

describe('splashViewOf', () => {
  it('shows the update search without a bar', () => {
    const view = splashViewOf(OFFLINE_VIEW, { kind: 'checking-update' });

    expect(view.title).toBe('Procurando atualizações…');
    expect(view.progress).toEqual({ kind: 'none' });
    expect(view.canRetry).toBe(false);
  });

  it('shows the download share as a whole percentage', () => {
    const view = splashViewOf(INITIAL_SPLASH_VIEW, {
      kind: 'downloading',
      downloaded: 21_000_000,
      total: 50_000_000,
    });

    expect(view.title).toBe('Baixando atualização');
    expect(view.progress).toEqual({ kind: 'determinate', percent: 42 });
  });

  it('shows an indeterminate bar when the server sends no total, never NaN', () => {
    const view = splashViewOf(INITIAL_SPLASH_VIEW, {
      kind: 'downloading',
      downloaded: 21_000_000,
      total: null,
    });

    expect(view.progress).toEqual({ kind: 'indeterminate' });
  });

  it('shows an indeterminate bar when the total is zero', () => {
    const view = splashViewOf(INITIAL_SPLASH_VIEW, {
      kind: 'downloading',
      downloaded: 0,
      total: 0,
    });

    expect(view.progress).toEqual({ kind: 'indeterminate' });
  });

  it('caps the bar at 100 when more arrives than announced', () => {
    const view = splashViewOf(INITIAL_SPLASH_VIEW, {
      kind: 'downloading',
      downloaded: 60,
      total: 50,
    });

    expect(view.progress).toEqual({ kind: 'determinate', percent: 100 });
  });

  it('warns that the app reopens by itself while installing', () => {
    const view = splashViewOf(INITIAL_SPLASH_VIEW, { kind: 'installing' });

    expect(view.title).toBe('Instalando…');
    expect(view.detail).toBe('O Lorkarium vai reabrir sozinho.');
    expect(view.canRetry).toBe(false);
  });

  it('shows the connection step', () => {
    expect(splashViewOf(OFFLINE_VIEW, { kind: 'connecting' }).title).toBe('Conectando…');
  });

  it('offers a retry when the server is down for maintenance', () => {
    const view = splashViewOf(INITIAL_SPLASH_VIEW, { kind: 'server-unavailable' });

    expect(view.title).toBe('O Lorkarium está em manutenção');
    expect(view.canRetry).toBe(true);
    expect(view.progress).toEqual({ kind: 'none' });
  });

  it('offers a retry when there is no connection', () => {
    expect(OFFLINE_VIEW.title).toBe('Sem conexão');
    expect(OFFLINE_VIEW.canRetry).toBe(true);
  });

  it('keeps the previous view when the event could not be read', () => {
    expect(splashViewOf(OFFLINE_VIEW, null)).toBe(OFFLINE_VIEW);
  });
});
