import { useLayoutEffect } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '@/components/brand-mark';
import type { DesktopWindow } from '@/services/desktop-window';
import { useWindowFocused } from './use-window-state';
import { WindowControls } from './window-controls';

export type WindowTitleBarProps = Readonly<{
  desktopWindow: DesktopWindow;
  /** Where the person is ("Suas mesas"), after LORKARIUM; `null` shows the name alone. */
  place: string | null;
  /** Receives the element pages portal into (the room top); without it, the bar has no slot. */
  slotRef?: (element: HTMLElement | null) => void;
  /** A page filled the slot: the bar takes the room shape (44 px) and drops the place. */
  occupied?: boolean;
}>;

const PLACE_BAR_HEIGHT = 38;
const ROOM_BAR_HEIGHT = 44;

/** The desktop app's own title bar over a frameless window: logo, place, an area that drags the
 *  window (the OS handles it through `app-region`) and the window controls.
 *
 *  Example: `<WindowTitleBar desktopWindow={desktopWindow} place="Suas mesas" />` */
export function WindowTitleBar({
  desktopWindow,
  place,
  slotRef,
  occupied = false,
}: WindowTitleBarProps): React.JSX.Element {
  const focused = useWindowFocused();
  const height = occupied ? ROOM_BAR_HEIGHT : PLACE_BAR_HEIGHT;
  useTitleBarHeight(height);
  return (
    <header
      aria-label="Barra da janela"
      data-title-bar
      data-app-region="drag"
      data-variant={occupied ? 'room' : 'place'}
      data-focused={focused}
      // Inline, over the `pointer-events: none` a Radix modal puts on the body.
      style={{ pointerEvents: 'auto', height }}
      className="group relative flex shrink-0 items-stretch border-b border-border bg-panel text-foreground select-none"
    >
      <TitleBarLogo />
      {!occupied && <TitleBarPlace place={place} />}
      {slotRef && (
        <div ref={slotRef} className={occupied ? 'flex min-w-0 flex-1 items-stretch' : 'hidden'} />
      )}
      {/* With the room top in the slot, its own empty middle drags and its actions sit right. */}
      <div
        data-testid="title-bar-drag-area"
        className={occupied ? 'w-3 shrink-0' : 'min-w-12 flex-1'}
      />
      <WindowControls desktopWindow={desktopWindow} />
    </header>
  );
}

function TitleBarLogo(): React.JSX.Element {
  return (
    <Link
      to="/"
      aria-label="Ir para Suas mesas"
      data-app-region="no-drag"
      className="flex w-14 shrink-0 items-center justify-center group-data-[focused=false]:opacity-50 hover:bg-card"
    >
      <BrandMark variant="icon" className="[&_svg]:size-[18px]" />
    </Link>
  );
}

function TitleBarPlace({ place }: Readonly<{ place: string | null }>): React.JSX.Element {
  return (
    <p className="flex items-center gap-2.5 text-[13px] whitespace-nowrap group-data-[focused=false]:opacity-50">
      <span className="font-brand text-xs font-semibold tracking-[0.3em]">LORKARIUM</span>
      {place && (
        <>
          {' '}
          <span className="text-input">/</span>{' '}
          <span className="text-muted-foreground">{place}</span>
        </>
      )}
    </p>
  );
}

// Dialogs, toasts and full-height pages are positioned below the bar through this variable.
function useTitleBarHeight(height: number): void {
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--title-bar-height', `${height}px`);
    return () => {
      root.removeProperty('--title-bar-height');
    };
  }, [height]);
}
