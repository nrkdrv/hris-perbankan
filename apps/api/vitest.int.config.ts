import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@hris/shared': resolve(root, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.int.spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 60000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
