import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    coverage: { include: ['src/server/**', 'src/lib/**'], reporter: ['text', 'lcov'] },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // `server-only` is a Next.js build-time guard; under Vitest it would throw on import.
      'server-only': resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
