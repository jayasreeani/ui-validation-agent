import { join } from 'node:path';
import type { AppConfig } from '../../config/index.js';
import type { BrowserAgent } from '../playwright/index.js';
import type { PixelComparer } from '../vision/index.js';
import type {
  DesignModel,
  ResponsiveResult,
  ValidationIssue,
  Viewport,
} from '../types/index.js';
import { logger, ensureDir } from '../utils/index.js';

export class ResponsiveValidator {
  constructor(private readonly config: AppConfig) {}

  getViewports(): Viewport[] {
    return this.config.viewports;
  }

  async validate(
    browser: BrowserAgent,
    options: {
      design?: DesignModel;
      pixelComparer?: PixelComparer;
      screenName?: string;
      diffDir?: string;
    } = {},
  ): Promise<ResponsiveResult[]> {
    const viewports = this.getViewports();
    const results: ResponsiveResult[] = [];
    const diffDir = options.diffDir ?? join(this.config.outputDir, 'responsive');
    await ensureDir(diffDir);

    logger.info('Running responsive validation', {
      viewports: viewports.map((v) => `${v.width}x${v.height}`),
    });

    for (const viewport of viewports) {
      await browser.setViewport(viewport);
      const shotName = `responsive-${viewport.width}x${viewport.height}`;
      const screenshotPath = await browser.captureScreenshot(shotName, {
        fullPage: true,
      });

      const issues: ValidationIssue[] = [];

      // Basic overflow / horizontal scroll detection
      const overflow = await browser.getPage().evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          scrollHeight: doc.scrollHeight,
          clientHeight: doc.clientHeight,
        };
      });

      if (overflow.scrollWidth > overflow.clientWidth + 2) {
        issues.push({
          id: `overflow-x-${viewport.width}x${viewport.height}`,
          category: 'responsive',
          severity: 'major',
          title: `Horizontal overflow at ${viewport.width}×${viewport.height}`,
          description: `Page scrollWidth (${overflow.scrollWidth}) exceeds viewport (${overflow.clientWidth}).`,
          expected: `scrollWidth <= ${viewport.width}`,
          actual: `scrollWidth=${overflow.scrollWidth}`,
          viewport: viewport.name,
          screenshotPath,
          suggestedFix:
            'Use responsive units, max-width: 100%, and fix fixed-width containers.',
        });
      }

      // Optional pixel compare against Figma baseline (scaled conceptually)
      let pixelDiff;
      if (
        options.design?.imagePath &&
        options.pixelComparer &&
        viewport.width >= 1280
      ) {
        try {
          pixelDiff = await options.pixelComparer.compare(
            options.design.imagePath,
            screenshotPath,
            {
              threshold: this.config.pixelDiffThreshold,
              maxDiffPercent: this.config.pixelDiffMaxPercent * 2,
              outputDir: diffDir,
              name: `responsive-${viewport.width}x${viewport.height}`,
            },
          );
          if (!pixelDiff.passed) {
            issues.push({
              id: `resp-pixel-${viewport.width}x${viewport.height}`,
              category: 'responsive',
              severity: 'major',
              title: `Visual regression at ${viewport.width}×${viewport.height}`,
              description: `Pixel diff ${pixelDiff.diffPercent}% exceeds threshold.`,
              expected: `<= ${this.config.pixelDiffMaxPercent * 2}%`,
              actual: `${pixelDiff.diffPercent}%`,
              viewport: viewport.name,
              screenshotPath,
              heatmapPath: pixelDiff.heatmapPath,
            });
          }
        } catch (error) {
          logger.warn('Responsive pixel compare skipped', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      results.push({
        viewport,
        screenshotPath,
        issues,
        pixelDiff,
      });
    }

    return results;
  }
}
