import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Count every file in `include`, not only the ones some test happened to
      // import — otherwise an untested module is simply invisible to the gate.
      all: true,
      // AIDO §9: >= 70% coverage is mandatory for the five modules that decide
      // whether the numbers are right. The rest of the app is not gated.
      include: [
        'src/modules/parser/**',
        'src/modules/forecast/**',
        'src/modules/bank-parser/**',
        'src/modules/reconcile/**',
        'src/modules/ai/**',
      ],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
});
