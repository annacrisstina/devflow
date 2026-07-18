import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    // BullMQ integration tests wait on real queue round-trips.
    testTimeout: 30_000,
  },
});
