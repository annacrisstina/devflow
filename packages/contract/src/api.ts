/**
 * DTOs of the public /api/v1 surface (ADR-0014). This package is the single
 * shared contract between apps/api (producer) and apps/web (consumer) —
 * types only, no runtime code, so neither app imports the other.
 *
 * Conventions: ids that are bigints in the database travel as strings (JSON
 * has no bigint); timestamps travel as ISO-8601 strings.
 */

export type ApiError = {
  error: {
    /** Stable, machine-readable. Messages are free to change; codes are not. */
    code: string;
    message: string;
  };
};

export type Paginated<T> = {
  items: T[];
  limit: number;
  offset: number;
  total: number;
};

export type SessionUserDto = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: 'owner' | 'member';
};

export type MeResponse = {
  user: SessionUserDto;
  workspaces: WorkspaceSummary[];
};

export type InstallationSummary = {
  id: string;
  githubInstallationId: string;
  accountLogin: string | null;
  accountType: string | null;
  uninstalledAt: string | null;
};

export type WorkspaceDetail = {
  id: string;
  name: string;
  role: 'owner' | 'member';
  installations: InstallationSummary[];
};

export type RepositorySummary = {
  id: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string | null;
};

export type FlakeVerdict = 'healthy' | 'suspected' | 'flaky';

export type FlakyTestSummary = {
  id: string;
  repositoryId: string;
  /** "owner/name" — the display handle. */
  repository: string;
  suiteName: string;
  className: string;
  testName: string;
  /** Score as last computed by the detection engine. */
  storedScore: number;
  /**
   * Score after read-time evidence decay (ADR-0014): what the stored score
   * is worth NOW, given how long ago it was computed.
   */
  effectiveScore: number;
  /** Verdict derived from effectiveScore with the deployment's thresholds. */
  verdict: FlakeVerdict;
  divergenceEvidence: number;
  transitionEvidence: number;
  lastFailureAt: string | null;
  computedAt: string;
};

export type TestOutcomeEntry = {
  workflowRunId: string;
  githubRunId: string;
  runAttempt: number;
  headBranch: string | null;
  headSha: string;
  status: string;
  runStartedAt: string | null;
  durationMs: number | null;
  failureMessage: string | null;
};

export type FlakyTestDetail = FlakyTestSummary & {
  history: TestOutcomeEntry[];
};

export type QuarantineStatus = 'active' | 'dismissed' | 'lifted';

/**
 * A human quarantine decision (ADR-0016). Proposals are not records — they
 * are flaky-verdict scores with no record yet, served as FlakyTestSummary.
 */
export type QuarantineRecord = {
  id: string;
  repositoryId: string;
  repository: string;
  suiteName: string;
  className: string;
  testName: string;
  status: QuarantineStatus;
  reason: string | null;
  createdAt: string;
  /** Display name of the deciding user (null if the account was removed). */
  createdBy: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  /**
   * Current score row for this identity, when one exists — the handle for
   * re-approving a dismissed identity (decisions reference scores).
   */
  scoreId: string | null;
};

export type RunSummary = {
  id: string;
  githubRunId: string;
  runAttempt: number;
  repository: string;
  name: string | null;
  headBranch: string | null;
  headSha: string;
  conclusion: string | null;
  processingStatus: string;
  runStartedAt: string | null;
  completedAt: string | null;
  totalTests: number;
  failedTests: number;
};
