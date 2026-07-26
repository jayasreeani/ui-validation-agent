#!/usr/bin/env node
import { Command } from 'commander';
import { join } from 'node:path';
import { loadConfig } from '../config/index.js';
import { ValidationAgent } from './agents/index.js';
import { ReportGenerator } from './reports/index.js';
import { logger, fileExists, readJson } from './utils/index.js';
import type { CliOptions, ValidationRunResult } from './types/index.js';

const program = new Command();

program
  .name('ui-validate')
  .description(
    'AI-powered UI Validation Agent — compare live web apps against Figma designs',
  )
  .version('1.0.0');

program
  .command('validate')
  .description('Run UI validation against the configured app and Figma design')
  .option('--figma-url <url>', 'Figma design/file URL')
  .option('--screen <path>', 'App route or absolute URL to validate')
  .option(
    '--mode <mode>',
    'full | figma | responsive | tokens | visual',
    'full',
  )
  .option('--output-dir <dir>', 'Override OUTPUT_DIR')
  .option('--headed', 'Run browser headed (not headless)')
  .option('--create-jira', 'Create Jira defects for critical/major issues')
  .action(async (opts) => {
    try {
      const config = loadConfig();
      if (opts.outputDir) {
        config.outputDir = opts.outputDir;
        config.screenshotDir = join(opts.outputDir, 'screenshots');
      }

      const options: CliOptions = {
        figmaUrl: opts.figmaUrl,
        screen: opts.screen,
        mode: opts.mode,
        outputDir: opts.outputDir,
        headless: opts.headed ? false : undefined,
        createJira: opts.createJira === true ? true : undefined,
      };

      const agent = new ValidationAgent(config);
      const result = await agent.run(options);

      console.log('\n=== Validation Summary ===');
      console.log(`Status: ${result.summary.passed ? 'PASS' : 'FAIL'}`);
      console.log(`Issues: ${result.summary.totalIssues}`);
      console.log(
        `  critical=${result.summary.critical} major=${result.summary.major} minor=${result.summary.minor} info=${result.summary.info}`,
      );
      if (result.reportPaths) {
        console.log(`HTML: ${result.reportPaths.html}`);
        console.log(`JSON: ${result.reportPaths.json}`);
        console.log(`PDF:  ${result.reportPaths.pdf}`);
      }
      if (result.jiraIssues?.length) {
        console.log(`Jira: ${result.jiraIssues.join(', ')}`);
      }

      process.exitCode = result.summary.passed ? 0 : 1;
    } catch (error) {
      logger.error('Validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 2;
    }
  });

program
  .command('report')
  .description('Regenerate HTML/JSON/PDF reports from an existing report.json')
  .option(
    '--from <path>',
    'Path to report.json',
    join('output', 'reports', 'report.json'),
  )
  .action(async (opts) => {
    try {
      const config = loadConfig();
      const fromPath = opts.from as string;
      if (!(await fileExists(fromPath))) {
        throw new Error(`Report file not found: ${fromPath}`);
      }
      const result = await readJson<ValidationRunResult>(fromPath);
      const generator = new ReportGenerator(config);
      const paths = await generator.generate(result);
      console.log('Reports regenerated:');
      console.log(`  HTML: ${paths.html}`);
      console.log(`  JSON: ${paths.json}`);
      console.log(`  PDF:  ${paths.pdf}`);
    } catch (error) {
      logger.error('Report generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 2;
    }
  });

program
  .command('show-config')
  .description('Print resolved configuration (secrets redacted)')
  .action(() => {
    const config = loadConfig();
    const redacted = {
      ...config,
      password: config.password ? '***' : '',
      figmaToken: config.figmaToken ? '***' : '',
      openaiApiKey: config.openaiApiKey ? '***' : '',
      azureOpenAiApiKey: config.azureOpenAiApiKey ? '***' : '',
      jiraToken: config.jiraToken ? '***' : '',
    };
    console.log(JSON.stringify(redacted, null, 2));
  });

async function main(): Promise<void> {
  // Ensure package is runnable even if invoked without subcommand help
  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
