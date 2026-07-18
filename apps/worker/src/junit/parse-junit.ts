import type { Readable } from 'node:stream';

import { SaxesParser, type SaxesTagPlain } from 'saxes';

export type JUnitCase = {
  suiteName: string;
  className: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  durationMs: number | null;
  failureMessage: string | null;
  failureDetails: string | null;
  file: string | null;
};

/** The XML is well-formed but its root is not a JUnit report — skip the file. */
export class NotJUnitError extends Error {
  constructor() {
    super('root element is not <testsuites>/<testsuite>');
    this.name = 'NotJUnitError';
  }
}

// Failure text can embed entire logs; results storage is not log storage.
const MESSAGE_CAP = 16_384;
const DETAILS_CAP = 65_536;

/**
 * Streaming JUnit XML parser (saxes): memory stays proportional to one test
 * case, not the file. Tolerant by design — missing attributes become nulls;
 * only structural violations (not-JUnit root, malformed XML) throw.
 */
export async function parseJUnitStream(stream: Readable): Promise<JUnitCase[]> {
  const parser = new SaxesParser();
  const cases: JUnitCase[] = [];

  let rootChecked = false;
  const suiteStack: string[] = [];
  let current: JUnitCase | null = null;
  let failureTagDepth = 0;
  let detailsBuffer = '';
  let parseError: Error | null = null;

  parser.on('error', (error) => {
    parseError = parseError ?? error;
  });

  parser.on('opentag', (tag: SaxesTagPlain) => {
    const name = tag.name.toLowerCase();
    if (!rootChecked) {
      rootChecked = true;
      if (name !== 'testsuites' && name !== 'testsuite') {
        parseError = parseError ?? new NotJUnitError();
        return;
      }
    }

    if (name === 'testsuite') {
      const suiteName = tag.attributes.name;
      suiteStack.push(typeof suiteName === 'string' ? suiteName : '');
      return;
    }

    if (name === 'testcase') {
      current = {
        suiteName: suiteStack.filter((s) => s !== '').join('/'),
        className: stringAttr(tag, 'classname') ?? '',
        testName: stringAttr(tag, 'name') ?? '(unnamed test)',
        status: 'passed',
        durationMs: durationMs(stringAttr(tag, 'time')),
        failureMessage: null,
        failureDetails: null,
        file: stringAttr(tag, 'file'),
      };
      return;
    }

    if (current !== null && (name === 'failure' || name === 'error' || name === 'skipped')) {
      current.status = name === 'failure' ? 'failed' : name === 'error' ? 'error' : 'skipped';
      const message = stringAttr(tag, 'message');
      if (message !== null) current.failureMessage = message.slice(0, MESSAGE_CAP);
      if (name !== 'skipped') {
        failureTagDepth += 1;
        detailsBuffer = '';
      }
    }
  });

  parser.on('text', (text) => {
    if (failureTagDepth > 0 && detailsBuffer.length < DETAILS_CAP) {
      detailsBuffer += text;
    }
  });
  parser.on('cdata', (cdata) => {
    if (failureTagDepth > 0 && detailsBuffer.length < DETAILS_CAP) {
      detailsBuffer += cdata;
    }
  });

  parser.on('closetag', (tag) => {
    const name = tag.name.toLowerCase();
    if (name === 'testsuite') {
      suiteStack.pop();
      return;
    }
    if ((name === 'failure' || name === 'error') && failureTagDepth > 0) {
      failureTagDepth -= 1;
      if (current !== null) {
        const details = detailsBuffer.trim().slice(0, DETAILS_CAP);
        if (details !== '') current.failureDetails = details;
      }
      return;
    }
    if (name === 'testcase' && current !== null) {
      cases.push(current);
      current = null;
    }
  });

  // TextDecoder with stream:true — a multi-byte character split across chunks
  // must not corrupt the XML.
  const decoder = new TextDecoder('utf-8');
  for await (const chunk of stream) {
    parser.write(decoder.decode(chunk as Buffer, { stream: true }));
    if (parseError !== null) break;
  }
  if (parseError === null) parser.close();

  if (parseError !== null) throw parseError;
  return cases;
}

function stringAttr(tag: SaxesTagPlain, name: string): string | null {
  const value = tag.attributes[name];
  return typeof value === 'string' && value !== '' ? value : null;
}

function durationMs(time: string | null): number | null {
  if (time === null) return null;
  const seconds = Number.parseFloat(time);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}
