/** A `DataTransfer` for drag-and-drop specs: jsdom has none, and the Testing Library's
 *  `fireEvent.dragStart(element, { dataTransfer })` only copies what it is given.
 *
 *  Example: `const dataTransfer = new DataTransferFake(); fireEvent.dragStart(card, { dataTransfer })` */
export class DataTransferFake {
  dropEffect: 'none' | 'copy' | 'link' | 'move' = 'none';
  effectAllowed = 'uninitialized';
  private readonly entries = new Map<string, string>();

  get types(): string[] {
    return [...this.entries.keys()];
  }

  setData(format: string, value: string): void {
    this.entries.set(format, value);
  }

  getData(format: string): string {
    return this.entries.get(format) ?? '';
  }

  clearData(): void {
    this.entries.clear();
  }

  setDragImage(): void {}
}
