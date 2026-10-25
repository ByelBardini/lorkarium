import type { PageNavigator } from '@/services/page-navigator';

/** Records every navigation instead of leaving the page. */
export class PageNavigatorFake implements PageNavigator {
  readonly assigned: string[] = [];

  assign(url: string): void {
    this.assigned.push(url);
  }
}
