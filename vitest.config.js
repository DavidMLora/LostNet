import { defineConfig } from 'vitest/config';
export default defineConfig({
  cacheDir: '.ci-local/vitest-cache',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    clearMocks: true,
    restoreMocks: true,
    env: { TZ: 'UTC' },
    testTimeout: 5000
  }
});
