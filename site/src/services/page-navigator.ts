export interface PageNavigator {
  assign(url: string): void;
}

/** Navigates the current tab; a download URL starts the download and keeps the page. */
export class WindowNavigator implements PageNavigator {
  assign(url: string): void {
    window.location.assign(url);
  }
}
