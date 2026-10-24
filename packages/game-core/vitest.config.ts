import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@lorkarium/game-core',
    // `pnpm bench`: the getter tracker counts every call into another module and weighs more than
    // the code measured (docs/context/client/performance.md).
    benchmark: { suppressExportGetterWarnings: true },
  },
});
