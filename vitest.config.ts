import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 10000,
    // A few daemon/IM timing-race tests orchestrate microsecond-level async
    // ordering that's deterministic on Linux but jittery on the shared Windows
    // runner's named-pipe IPC (occasional ipc-timeout / edit-lands-late). Retry
    // ONLY on win32 so genuine, deterministic failures still fail fast on Linux.
    retry: process.platform === 'win32' ? 3 : 0,
  },
});
