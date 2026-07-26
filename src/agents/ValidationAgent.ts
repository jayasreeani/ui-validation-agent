import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { AppConfig } from '../../config/index.js';
import type { CliOptions, ValidationIssue, ValidationRunResult } from '../types/index.js';
import { FigmaService } from '../figma/index.js';
import { BrowserAgent } from '../playwright/index.js';
import { PixelComparer, VisionComparer } from '../vision/index.js';
import {
  DesignTokenValidator,
  ResponsiveValidator,
  RootCauseAnalyzer,
} from '../services/index.js';
import { ReportGenerator } from '../reports/index.js';
import { JiraClient } from '../jira/index.js';
import { ensureDir, logger, setLogLevel } from '../utils/index.js';

function summarize(issues: ValidationIssue[]): ValidationRunResult['summary'] {
  const critical = issues.filter((i) => i.severity === 'critical').length;
  const major = issues.filter((i) => i.severity === 'major').length;
  const minor = issues.filter((i) => i.severity === 'minor').length;
  const info = issues.filter((i) => i.severity === 'info').length;
  return {
    totalIssues: issues.length,
    critical,
    major,
    minor,
    info,
    passed: critical === 0 && major === 0,
  };
}

/**
 * Orchestrates Figma → Playwright → pixel/AI vision → tokens → responsive → reports → Jira.
 */
export class ValidationAgent {
  private readonly figma: FigmaService;
  private readonly browser: BrowserAgent;
  private readonly pixels: PixelComparer;
  private readonly vision: VisionComparer;
  private readonly tokens: DesignTokenValidator;
  private readonly responsive: ResponsiveValidator;
  private readonly rootCause: RootCauseAnalyzer;
  private readonly reports: ReportGenerator;
  private readonly jira: JiraClient;

  constructor(private readonly config: AppConfig) {
    setLogLevel(config.logLevel);
    this.figma = new FigmaService(config);
    this.browser = new BrowserAgent(config);
    this.pixels = new PixelComparer();
    this.vision = new VisionComparer(config);
    this.tokens = new DesignTokenValidator(config);
    this.responsive = new ResponsiveValidator(config);
    this.rootCause = new RootCauseAnalyzer(this.vision);
    this.reports = new ReportGenerator(config);
    this.jira = new JiraClient(config);
  }

  async run(options: CliOptions = {}): Promise<ValidationRunResult> {
    const mode = options.mode ?? 'full';
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    logger.info('Starting validation run', { runId, mode, options });

    await ensureDir(this.config.outputDir);
    await ensureDir(this.config.screenshotDir);

    const screenshots: string[] = [];
    let allIssues: ValidationIssue[] = [];
    const result: ValidationRunResult = {
      runId,
      startedAt,
      finishedAt: '',
      appUrl: this.config.appUrl,
      screen: options.screen,
      figmaUrl: options.figmaUrl,
      screenshots,
      tokenResults: [],
      responsiveResults: [],
      issues: [],
      summary: summarize([]),
    };

    try {
      // --- Figma ---
      if (mode === 'full' || mode === 'figma' || mode === 'tokens' || mode === 'visual') {
        if (options.figmaUrl || this.config.figmaFileKey || this.config.figmaToken) {
          try {
            result.design = await this.figma.loadDesign(options.figmaUrl);
          } catch (error) {
            logger.warn('Figma load failed — continuing without design model', {
              error: error instanceof Error ? error.message : String(error),
            });
            allIssues.push({
              id: 'figma-load-error',
              category: 'other',
              severity: 'major',
              title: 'Failed to load Figma design',
              description:
                error instanceof Error ? error.message : String(error),
              suggestedFix: 'Verify FIGMA_TOKEN, file key, and node id.',
            });
          }
        } else {
          logger.warn('No Figma credentials/URL — skipping design fetch');
        }
      }

      if (mode === 'figma') {
        // Figma-only mode: parse + save model, skip browser
        result.finishedAt = new Date().toISOString();
        result.issues = allIssues;
        result.summary = summarize(allIssues);
        const paths = await this.reports.generate(result);
        result.reportPaths = paths;
        return result;
      }

      // --- Browser ---
      await this.browser.launch({
        headless: options.headless ?? this.config.headless,
      });

      const targetUrl = options.screen
        ? undefined
        : this.config.appUrl;

      if (options.screen) {
        await this.browser.navigateToScreen(options.screen);
      } else if (targetUrl) {
        await this.browser.navigate(targetUrl);
      }

      await this.browser.login();

      const mainShot = await this.browser.captureScreenshot(
        `main-${options.screen ?? 'home'}`,
      );
      screenshots.push(mainShot);

      // --- Pixel + Vision ---
      if (
        (mode === 'full' || mode === 'visual') &&
        result.design?.imagePath
      ) {
        const diffDir = join(this.config.outputDir, 'diffs');
        result.pixelDiff = await this.pixels.compare(
          result.design.imagePath,
          mainShot,
          {
            threshold: this.config.pixelDiffThreshold,
            maxDiffPercent: this.config.pixelDiffMaxPercent,
            outputDir: diffDir,
            name: 'main',
          },
        );

        if (!result.pixelDiff.passed) {
          allIssues.push({
            id: 'pixel-diff-main',
            category: 'visual-diff',
            severity: 'major',
            title: 'Pixel difference exceeds threshold',
            description: `${result.pixelDiff.diffPercent}% of pixels differ (max ${this.config.pixelDiffMaxPercent}%).`,
            expected: `<= ${this.config.pixelDiffMaxPercent}%`,
            actual: `${result.pixelDiff.diffPercent}%`,
            screenshotPath: mainShot,
            heatmapPath: result.pixelDiff.heatmapPath,
          });
        }

        if (this.vision.isEnabled()) {
          result.visionDiff = await this.vision.compare(
            result.design.imagePath,
            mainShot,
            {
              screen: options.screen,
              designName: result.design.name,
            },
          );
          allIssues.push(...result.visionDiff.issues);
        }
      }

      // --- Design tokens ---
      if (
        (mode === 'full' || mode === 'tokens') &&
        result.design
      ) {
        const domStyles = await this.browser.collectDomStyles();
        const tokenOutcome = this.tokens.validate(result.design, domStyles);
        result.tokenResults = tokenOutcome.tokenResults;
        allIssues.push(...tokenOutcome.issues);
      }

      // --- Responsive ---
      if (mode === 'full' || mode === 'responsive') {
        result.responsiveResults = await this.responsive.validate(this.browser, {
          design: result.design,
          pixelComparer: this.pixels,
          screenName: options.screen,
          diffDir: join(this.config.outputDir, 'responsive'),
        });
        for (const r of result.responsiveResults) {
          screenshots.push(r.screenshotPath);
          allIssues.push(...r.issues);
        }
      }

      // --- Root cause enrichment ---
      allIssues = await this.rootCause.enrich(allIssues, mainShot);

      result.issues = allIssues;
      result.summary = summarize(allIssues);
      result.finishedAt = new Date().toISOString();

      const paths = await this.reports.generate(result);
      result.reportPaths = paths;

      const createJira =
        options.createJira === true ||
        (options.createJira !== false && this.jira.isEnabled());
      if (createJira && this.jira.isEnabled()) {
        result.jiraIssues = await this.jira.createDefectsForIssues(allIssues);
      }

      logger.info('Validation complete', {
        runId,
        passed: result.summary.passed,
        issues: result.summary.totalIssues,
        reports: result.reportPaths,
      });

      return result;
    } finally {
      await this.browser.close();
    }
  }
}
