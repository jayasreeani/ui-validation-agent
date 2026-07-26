import dotenv from 'dotenv';
import { AppConfigSchema, type AppConfig } from './schema.js';

dotenv.config();

let cached: AppConfig | null = null;

/**
 * Load and validate configuration from environment variables.
 */
export function loadConfig(envPath?: string): AppConfig {
  if (cached && !envPath) return cached;

  if (envPath) {
    dotenv.config({ path: envPath, override: true });
  }

  const raw = {
    appUrl: process.env.APP_URL ?? 'https://example.com',
    // Prefer APP_* to avoid Windows USERNAME collision with the OS account name
    username: process.env.APP_USERNAME || process.env.LOGIN_USERNAME || '',
    password: process.env.APP_PASSWORD || process.env.LOGIN_PASSWORD || '',
    loginSelectorUser: process.env.LOGIN_SELECTOR_USER,
    loginSelectorPass: process.env.LOGIN_SELECTOR_PASS,
    loginSelectorSubmit: process.env.LOGIN_SELECTOR_SUBMIT,

    figmaToken: process.env.FIGMA_TOKEN ?? '',
    figmaFileKey: process.env.FIGMA_FILE_KEY ?? '',
    figmaNodeId: process.env.FIGMA_NODE_ID ?? '',

    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiModel: process.env.OPENAI_MODEL,
    aiProvider: process.env.AI_PROVIDER,
    azureOpenAiEndpoint: process.env.AZURE_OPENAI_ENDPOINT ?? '',
    azureOpenAiApiKey: process.env.AZURE_OPENAI_API_KEY ?? '',
    azureOpenAiDeployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    azureOpenAiApiVersion: process.env.AZURE_OPENAI_API_VERSION,

    pixelDiffThreshold: process.env.PIXEL_DIFF_THRESHOLD,
    pixelDiffMaxPercent: process.env.PIXEL_DIFF_MAX_PERCENT,
    aiVisionEnabled: process.env.AI_VISION_ENABLED,

    browser: process.env.BROWSER,
    headless: process.env.HEADLESS,
    navigationTimeoutMs: process.env.NAVIGATION_TIMEOUT_MS,
    screenshotDir: process.env.SCREENSHOT_DIR,

    viewports: process.env.VIEWPORTS,

    colorTolerance: process.env.COLOR_TOLERANCE,
    spacingTolerancePx: process.env.SPACING_TOLERANCE_PX,
    fontSizeTolerancePx: process.env.FONT_SIZE_TOLERANCE_PX,

    jiraEnabled: process.env.JIRA_ENABLED,
    jiraBaseUrl: process.env.JIRA_BASE_URL ?? '',
    jiraEmail: process.env.JIRA_EMAIL ?? '',
    jiraToken: process.env.JIRA_TOKEN ?? '',
    jiraProjectKey: process.env.JIRA_PROJECT_KEY ?? '',

    outputDir: process.env.OUTPUT_DIR,
    reportTitle: process.env.REPORT_TITLE,

    logLevel: process.env.LOG_LEVEL,
    retryAttempts: process.env.RETRY_ATTEMPTS,
    retryDelayMs: process.env.RETRY_DELAY_MS,
  };

  const parsed = AppConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${details}`);
  }

  cached = parsed.data;
  return cached;
}

export function resetConfigCache(): void {
  cached = null;
}

export type { AppConfig } from './schema.js';
export { AppConfigSchema } from './schema.js';
