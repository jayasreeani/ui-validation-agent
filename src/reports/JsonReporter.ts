import { join } from 'node:path';
import type { ValidationRunResult } from '../types/index.js';
import { ensureDir, logger, writeJson } from '../utils/index.js';

export class JsonReporter {
  async generate(result: ValidationRunResult, outputDir: string): Promise<string> {
    await ensureDir(outputDir);
    const outPath = join(outputDir, 'report.json');
    await writeJson(outPath, result);
    logger.info('JSON report written', { outPath });
    return outPath;
  }
}
