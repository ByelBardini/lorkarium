/** The desktop shell the page runs in, read from what it appends to the user-agent. */
export type DesktopShell = Readonly<{
  version: string;
  /** The shell opens a frameless window and expects the page to draw the title bar. */
  titleBar: boolean;
}>;

/** Whether the page runs inside the Lorkarium desktop shell (Tauri), which appends
 *  ` LorkariumDesktop/<version>` to the WebView2 user-agent.
 *
 *  Example: `isDesktopShell(navigator.userAgent)` */
export function isDesktopShell(userAgent: string): boolean {
  return desktopShellOf(userAgent) !== null;
}

/** The shell's version and whether it has its own title bar (` LorkariumTitleBar/1`), or `null`
 *  in a browser. An old shell without the mark keeps the native frame, so the page draws none.
 *
 *  Example: `desktopShellOf(navigator.userAgent)?.titleBar` */
export function desktopShellOf(userAgent: string): DesktopShell | null {
  const version = DESKTOP_SHELL_TOKEN.exec(userAgent)?.[1];
  if (!version) return null;
  return { version, titleBar: TITLE_BAR_TOKEN.test(userAgent) };
}

const DESKTOP_SHELL_TOKEN = /(?:^|\s)LorkariumDesktop\/(\d+(?:\.\d+)*)(?=\s|$)/;
const TITLE_BAR_TOKEN = /(?:^|\s)LorkariumTitleBar\/1(?=\s|$)/;
