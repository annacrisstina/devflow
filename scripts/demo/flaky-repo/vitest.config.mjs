import { defineConfig } from 'vitest/config';

// JUnit XML is what DevFlow ingests (uploaded by the workflow as an artifact).
export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/junit.xml' },
  },
});
