import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DesktopWindow } from '@/services/desktop-window';
import { ignoreRefusal, useWindowMaximized } from './use-window-state';

type WindowControlsProps = Readonly<{ desktopWindow: DesktopWindow }>;

/** Minimize, maximize ↔ restore and close, 46 px wide each like the native buttons, and out of
 *  the Tab order like them (the keyboard has Alt+Space, Alt+F4 and Win+arrows).
 *
 *  Example: `<WindowControls desktopWindow={desktopWindow} />` */
export function WindowControls({ desktopWindow }: WindowControlsProps): React.JSX.Element {
  const maximized = useWindowMaximized(desktopWindow);
  return (
    <TooltipProvider delayDuration={600}>
      <div className="flex items-stretch border-l border-border">
        <ControlButton label="Minimizar" onPress={() => desktopWindow.minimize()}>
          <path d="M0 5.5h10" />
        </ControlButton>
        <ControlButton
          label={maximized ? 'Restaurar' : 'Maximizar'}
          hint={`${maximized ? 'Restaurar' : 'Maximizar'} · Win+Z mostra os layouts de encaixe`}
          onPress={() => desktopWindow.toggleMaximize()}
        >
          {maximized ? <RestoreIcon /> : <rect x=".5" y=".5" width="9" height="9" rx="1.5" />}
        </ControlButton>
        <ControlButton label="Fechar" danger onPress={() => desktopWindow.close()}>
          <path d="M.5.5l9 9M9.5.5l-9 9" />
        </ControlButton>
      </div>
    </TooltipProvider>
  );
}

type ControlButtonProps = Readonly<{
  label: string;
  hint?: string;
  danger?: boolean;
  onPress: () => Promise<void>;
  children: React.ReactNode;
}>;

function ControlButton({ label, hint, danger, onPress, children }: ControlButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          tabIndex={-1}
          data-app-region="no-drag"
          onClick={() => void onPress().catch(ignoreRefusal)}
          className={cn(
            'inline-flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors duration-100 group-data-[focused=false]:text-placeholder/70 hover:text-foreground motion-reduce:transition-none',
            danger
              ? 'hover:bg-destructive active:bg-destructive/80'
              : 'hover:bg-accent active:bg-muted',
          )}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            aria-hidden="true"
          >
            {children}
          </svg>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint ?? label}</TooltipContent>
    </Tooltip>
  );
}

function RestoreIcon(): React.JSX.Element {
  return (
    <>
      <rect x=".5" y="2.5" width="7" height="7" rx="1.5" />
      <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
    </>
  );
}
