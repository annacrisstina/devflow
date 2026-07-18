import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { NotJUnitError, parseJUnitStream, type JUnitCase } from '../src/junit/parse-junit.js';

function fixtureStream(name: string): ReturnType<typeof createReadStream> {
  return createReadStream(fileURLToPath(new URL(`./fixtures/junit/${name}`, import.meta.url)));
}

describe('parseJUnitStream', () => {
  it('parses a jest-junit report (failures, CDATA, parameterized duplicates)', async () => {
    const cases = await parseJUnitStream(fixtureStream('jest-junit.xml'));
    expect(cases).toHaveLength(5);

    const failed = cases.filter((c) => c.status === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]?.testName).toBe('refreshes expired tokens');
    // <testsuites name> is report metadata, not part of the suite path.
    expect(failed[0]?.suiteName).toBe('auth');
    expect(failed[0]?.failureMessage).toBe('expected 401 to be 200');
    expect(failed[0]?.failureDetails).toContain('src/auth/token.test.ts:88:19');
    expect(failed[0]?.durationMs).toBe(1902);

    // Parameterized tests repeat identities — both rows must survive.
    const duplicates = cases.filter((c) => c.testName === 'retry works [attempt 1]');
    expect(duplicates).toHaveLength(2);
  });

  it('parses a pytest report (skipped with reason, file attribute)', async () => {
    const cases = await parseJUnitStream(fixtureStream('pytest.xml'));
    expect(cases).toHaveLength(3);
    const skipped = cases.find((c) => c.status === 'skipped');
    expect(skipped?.testName).toBe('test_needs_docker');
    expect(skipped?.failureMessage).toBe('docker not available in CI');
    expect(skipped?.file).toBe('tests/test_api.py');
    expect(cases[0]?.className).toBe('tests.test_api');
  });

  it('parses a surefire report (bare testsuite root, error status)', async () => {
    const cases = await parseJUnitStream(fixtureStream('surefire.xml'));
    expect(cases).toHaveLength(2);
    const errored = cases.find((c) => c.status === 'error');
    expect(errored?.testName).toBe('handlesConnectionLoss');
    expect(errored?.failureMessage).toBe('Connection refused');
    expect(errored?.failureDetails).toContain('ConnectException');
  });

  it('flattens nested suites into a path', async () => {
    const cases = await parseJUnitStream(fixtureStream('nested-suites.xml'));
    expect(cases.map((c) => c.suiteName).sort()).toEqual(['root', 'root/inner']);
  });

  it('rejects non-JUnit XML by root element', async () => {
    await expect(parseJUnitStream(fixtureStream('not-junit.xml'))).rejects.toBeInstanceOf(
      NotJUnitError,
    );
  });

  it('throws on malformed XML', async () => {
    await expect(parseJUnitStream(fixtureStream('malformed.xml'))).rejects.toThrow();
  });

  it('truncates oversized failure details', async () => {
    const huge = 'x'.repeat(200_000);
    const xml = `<testsuites><testsuite name="s"><testcase name="t"><failure message="m">${huge}</failure></testcase></testsuite></testsuites>`;
    const cases = await parseJUnitStream(Readable.from([Buffer.from(xml)]));
    expect((cases[0] as JUnitCase).failureDetails!.length).toBeLessThanOrEqual(65_536 + 8_192);
  });
});
