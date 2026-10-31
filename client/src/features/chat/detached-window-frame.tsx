import { useEffect, type ReactNode } from 'react';
import { usePortalContainer } from '@/lib/portal-window';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/brand-mark';
import { WindowControls } from '@/app/title-bar/window-controls';
import { WindowPinToggle } from './window-pin-toggle';
import type { ChatWindow } from './use-chat-window';

/** Shared title bar and content of a detached panel. The "Sempre por cima" pin and `actions` go
 *  in the title bar, beside the window controls (`hidePin` drops the pin); `flush` lets the
 *  content reach the edges (it draws its own spacing).
 *
 *  Example: `<DetachedWindowFrame title="Dados" window={popup}>…</DetachedWindowFrame>` */
export function DetachedWindowFrame({
  title,
  window: popup,
  children,
  hidePin = false,
  actions,
  flush = false,
}: Readonly<{
  title: string;
  window: ChatWindow;
  children: ReactNode;
  hidePin?: boolean;
  actions?: ReactNode;
  flush?: boolean;
}>): React.JSX.Element {
  const container = usePortalContainer();
  useEffect(() => {
    const page = container?.ownerDocument;
    if (!page) return;
    const heading =
      page.querySelector('title') ?? page.head.appendChild(page.createElement('title'));
    heading.replaceChildren(page.createTextNode(`${title} · Lorkarium`));
    page.documentElement.style.setProperty(
      '--title-bar-height',
      popup.desktopWindow ? '38px' : '0px',
    );
    return () => {
      page.documentElement.style.removeProperty('--title-bar-height');
    };
  }, [container, title, popup.desktopWindow]);
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-panel">
      <header
        aria-label="Barra da janela"
        data-app-region={popup.desktopWindow ? 'drag' : undefined}
        className="flex h-[38px] shrink-0 items-stretch border-b border-border bg-background"
      >
        <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-2 px-3">
          <BrandMark variant="icon" className="[&>svg]:size-5" />
          <span className="truncate text-xs text-label">
            LORKARIUM <span className="text-muted-foreground">/ {title}</span>
          </span>
        </div>
        {(actions || !hidePin) && (
          <div data-app-region="no-drag" className="flex shrink-0 items-center gap-1 px-2">
            {!hidePin && <WindowPinToggle chatWindow={popup} />}
            {actions}
          </div>
        )}
        {popup.desktopWindow && <WindowControls desktopWindow={popup.desktopWindow} />}
      </header>
      <div className={cn('flex min-h-0 flex-1 flex-col', !flush && 'px-4 pt-3')}>
        {popup.alwaysOnTopProblem && (
          <p role="alert" className="px-4 py-2 text-xs text-destructive-text">
            {popup.alwaysOnTopProblem}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
