import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests share one throwaway database; keep them sequential.
    fileParallelism: false,
  },
});
