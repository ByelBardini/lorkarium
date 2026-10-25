/** Whether the page runs inside the Lorkarium desktop shell (Tauri), which appends
 *  ` LorkariumDesktop/<version>` to the WebView2 user-agent.
 *
 *  Example: `isDesktopShell(navigator.userAgent)` */
export function isDesktopShell(userAgent: string): boolean {
  return DESKTOP_SHELL_TOKEN.test(userAgent);
}

const DESKTOP_SHELL_TOKEN = /(?:^|\s)LorkariumDesktop\/\d+(?:\.\d+)*/;
