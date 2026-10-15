import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// jest-dom 7 augments `Assertion<T>`, but Vitest 5 declares `Assertion<R, T>`, so its own
// augmentation is dropped; Vitest 5 asks for custom matchers on `Matchers<R, T>`.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<T, R> {}
}
