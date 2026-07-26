import { join } from 'node:path';
import type { AppConfig } from '../../config/index.js';
import type { ValidationRunResult } from '../types/index.js';
import { ensureDir, logger } from '../utils/index.js';
import { HtmlReporter } from './HtmlReporter.js';
import { JsonReporter } from './JsonReporter.js';
import { PdfReporter } from './PdfReporter.js';

export interface ReportPaths {
  html: string;
  json: string;
  pdf: string;
}

/**
 * Orchestrates HTML + JSON + PDF report generation.
 */
export class ReportGenerator {
  private readonly html: HtmlReporter;
  private readonly json: JsonReporter;
  private readonly pdf: PdfReporter;

  constructor(private readonly config: AppConfig) {
    this.html = new HtmlReporter(config);
    this.json = new JsonReporter();
    this.pdf = new PdfReporter(config);
  }

  async generate(result: ValidationRunResult, outputDir?: string): Promise<ReportPaths> {
    const dir = outputDir ?? join(this.config.outputDir, 'reports');
    await ensureDir(dir);

    const [html, json, pdf] = await Promise.all([
      this.html.generate(result, dir),
      this.json.generate(result, dir),
      this.pdf.generate(result, dir),
    ]);

    const paths = { html, json, pdf };
    result.reportPaths = paths;
    logger.info('All reports generated', paths);
    return paths;
  }
}

export { HtmlReporter } from './HtmlReporter.js';
export { JsonReporter } from './JsonReporter.js';
export { PdfReporter } from './PdfReporter.js';
