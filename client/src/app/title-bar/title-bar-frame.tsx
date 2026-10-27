import type { DesktopWindow } from '@/services/desktop-window';
import { TitleBarSlotContext, useTitleBarSlotState } from './title-bar-slot';
import { WindowTitleBar } from './window-title-bar';

export type TitleBarFrameProps = Readonly<{
  desktopWindow: DesktopWindow | null;
  place: string | null;
  children: React.ReactNode;
}>;

/** In the desktop shell, the title bar on top and the page scrolling under it; in a browser
 *  (no `desktopWindow`), the page alone, as before.
 *
 *  Example: `<TitleBarFrame desktopWindow={deps.desktopWindow} place="Suas mesas"><Outlet /></TitleBarFrame>` */
export function TitleBarFrame({
  desktopWindow,
  place,
  children,
}: TitleBarFrameProps): React.JSX.Element {
  if (!desktopWindow) return <>{children}</>;
  return (
    <FramedPage desktopWindow={desktopWindow} place={place}>
      {children}
    </FramedPage>
  );
}

function FramedPage({
  desktopWindow,
  place,
  children,
}: TitleBarFrameProps & Readonly<{ desktopWindow: DesktopWindow }>): React.JSX.Element {
  const { slot, occupied, setElement } = useTitleBarSlotState();
  return (
    <div className="flex h-svh flex-col">
      <WindowTitleBar
        desktopWindow={desktopWindow}
        place={place}
        slotRef={setElement}
        occupied={occupied}
      />
      <div className="relative min-h-0 flex-1 overflow-auto">
        <TitleBarSlotContext value={slot}>{children}</TitleBarSlotContext>
      </div>
    </div>
  );
}
