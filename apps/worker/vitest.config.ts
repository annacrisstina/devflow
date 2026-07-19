import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // JUnit XML feeds DevFlow's own dogfooding (M6): CI uploads these files
    // as the artifact a DevFlow deployment ingests.
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/junit.xml' },
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    // BullMQ integration tests wait on real queue round-trips.
    testTimeout: 30_000,
  },
});
