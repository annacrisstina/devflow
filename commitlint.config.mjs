export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      // Keep in sync with docs/conventions.md#commit-scopes
      ['repo', 'ci', 'docs', 'api', 'web', 'ingest', 'worker', 'db', 'shared', 'deps'],
    ],
  },
};
