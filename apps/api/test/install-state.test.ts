import { describe, expect, it } from 'vitest';

import { createInstallState, verifyInstallState } from '../src/github/install-state.js';

const SECRET = 'test-auth-secret-test-auth-secret!!';

describe('install state (signed claim token)', () => {
  it('round-trips workspace and user', () => {
    const state = createInstallState(SECRET, 42n, 'user-1');
    const verified = verifyInstallState(SECRET, state);
    expect(verified).toMatchObject({ workspaceId: '42', userId: 'user-1' });
  });

  it('rejects a tampered payload', () => {
    const state = createInstallState(SECRET, 42n, 'user-1');
    const [payload, sig] = state.split('.');
    const forged = Buffer.from(
      JSON.stringify({ workspaceId: '999', userId: 'user-1', exp: 9999999999 }),
    ).toString('base64url');
    expect(verifyInstallState(SECRET, `${forged}.${sig}`)).toBeNull();
    expect(verifyInstallState(SECRET, `${payload}.AAAA${sig}`)).toBeNull();
  });

  it('rejects a state signed with a different secret', () => {
    const state = createInstallState('another-secret-another-secret-32ch', 42n, 'user-1');
    expect(verifyInstallState(SECRET, state)).toBeNull();
  });

  it('rejects an expired state', () => {
    const state = createInstallState(SECRET, 42n, 'user-1', -1);
    expect(verifyInstallState(SECRET, state)).toBeNull();
  });

  it('rejects garbage without throwing', () => {
    expect(verifyInstallState(SECRET, '')).toBeNull();
    expect(verifyInstallState(SECRET, 'no-dot')).toBeNull();
    expect(verifyInstallState(SECRET, 'a.b')).toBeNull();
    expect(verifyInstallState(SECRET, '%%%.%%%')).toBeNull();
  });
});
