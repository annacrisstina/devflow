import yauzl from 'yauzl';

import { parseJUnitStream, type JUnitCase } from '../junit/parse-junit.js';

export type ZipScanResult = {
  cases: JUnitCase[];
  /** XML entries that parsed as JUnit reports. */
  junitFiles: number;
  /** XML entries skipped (not JUnit, malformed, oversized). */
  skippedFiles: number;
};

/**
 * Scans an artifact zip for JUnit XML. Discovery is heuristic by design
 * (founder-approved): any *.xml whose root is testsuites/testsuite counts —
 * zero configuration for users; non-reports are skipped by root validation.
 */
export async function scanZipForJUnit(
  zipPath: string,
  maxXmlEntryBytes: number,
): Promise<ZipScanResult> {
  const zipfile = await openZip(zipPath);
  const result: ZipScanResult = { cases: [], junitFiles: 0, skippedFiles: 0 };

  await new Promise<void>((resolve, reject) => {
    zipfile.on('error', reject);
    zipfile.on('end', resolve);
    zipfile.on('entry', (entry: yauzl.Entry) => {
      const isXml = !entry.fileName.endsWith('/') && entry.fileName.toLowerCase().endsWith('.xml');
      // uncompressedSize check is also the zip-bomb guard.
      if (!isXml || entry.uncompressedSize > maxXmlEntryBytes) {
        if (isXml) result.skippedFiles += 1;
        zipfile.readEntry();
        return;
      }
      zipfile.openReadStream(entry, (error, stream) => {
        if (error || stream === undefined) {
          result.skippedFiles += 1;
          zipfile.readEntry();
          return;
        }
        parseJUnitStream(stream)
          .then((cases) => {
            result.cases.push(...cases);
            result.junitFiles += 1;
          })
          .catch(() => {
            // Not-JUnit and malformed XML are per-file facts, never job
            // failures; the counts surface them in run_artifacts.
            result.skippedFiles += 1;
            stream.destroy();
          })
          .finally(() => {
            zipfile.readEntry();
          });
      });
    });
    zipfile.readEntry();
  });

  return result;
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, zipfile) => {
      if (error || zipfile === undefined) {
        reject(error ?? new Error('yauzl returned no zipfile'));
      } else {
        resolve(zipfile);
      }
    });
  });
}
