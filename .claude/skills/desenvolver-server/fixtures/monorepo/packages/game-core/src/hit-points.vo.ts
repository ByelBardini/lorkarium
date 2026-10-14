// Propositalmente errado: VO mutável, com identidade, lendo o relógio e sem spec.
export class HitPoints {
  id: string;
  current: number;
  readonly max: number;

  constructor(current: number, max: number) {
    this.id = String(Date.now());
    this.current = current;
    this.max = max;
  }

  set value(next: number) {
    this.current = next;
  }
}
