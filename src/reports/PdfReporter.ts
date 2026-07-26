import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig } from '../../config/index.js';
import type { ValidationRunResult } from '../types/index.js';
import { ensureDir, fileExists, logger } from '../utils/index.js';

export class PdfReporter {
  constructor(private readonly config: AppConfig) {}

  async generate(result: ValidationRunResult, outputDir: string): Promise<string> {
    await ensureDir(outputDir);
    const outPath = join(outputDir, 'report.pdf');

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = createWriteStream(outPath);
    doc.pipe(stream);

    doc
      .fontSize(20)
      .fillColor('#0f172a')
      .text(this.config.reportTitle);
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .fillColor('#475569')
      .text(`Run ID: ${result.runId}`)
      .text(`App: ${result.appUrl}`)
      .text(`Started: ${result.startedAt}`)
      .text(`Finished: ${result.finishedAt}`)
      .text(
        `Status: ${result.summary.passed ? 'PASS' : 'FAIL'} · Issues: ${result.summary.totalIssues} (critical ${result.summary.critical}, major ${result.summary.major})`,
      );

    doc.moveDown();
    doc.fontSize(14).fillColor('#0f172a').text('Issues');
    doc.moveDown(0.5);

    if (result.issues.length === 0) {
      doc.fontSize(11).fillColor('#16a34a').text('No issues detected.');
    } else {
      for (const issue of result.issues.slice(0, 40)) {
        doc
          .fontSize(11)
          .fillColor('#0f172a')
          .text(`[${issue.severity.toUpperCase()}] ${issue.title}`);
        doc
          .fontSize(9)
          .fillColor('#334155')
          .text(issue.description, { width: 500 });
        if (issue.suggestedFix) {
          doc
            .fontSize(9)
            .fillColor('#15803d')
            .text(`Fix: ${issue.suggestedFix}`, { width: 500 });
        }
        doc.moveDown(0.6);
        if (doc.y > 720) doc.addPage();
      }
      if (result.issues.length > 40) {
        doc
          .fontSize(9)
          .fillColor('#64748b')
          .text(
            `…and ${result.issues.length - 40} more issues (see JSON/HTML reports).`,
          );
      }
    }

    const shot = result.screenshots[0];
    if (shot && (await fileExists(shot))) {
      try {
        doc.addPage();
        doc.fontSize(14).fillColor('#0f172a').text('Screenshot');
        doc.moveDown(0.5);
        doc.image(shot, { fit: [500, 640], align: 'center' });
      } catch (error) {
        logger.warn('Could not embed screenshot in PDF', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (
      result.pixelDiff?.diffImagePath &&
      (await fileExists(result.pixelDiff.diffImagePath))
    ) {
      try {
        doc.addPage();
        doc.fontSize(14).fillColor('#0f172a').text('Pixel Diff');
        doc.moveDown(0.5);
        doc.image(result.pixelDiff.diffImagePath, {
          fit: [500, 640],
          align: 'center',
        });
      } catch {
        /* ignore embed errors */
      }
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    logger.info('PDF report written', { outPath });
    return outPath;
  }
}
