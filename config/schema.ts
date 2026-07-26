import { z } from 'zod';
import type { Viewport } from '../src/types/index.js';

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
  });

const numberFromEnv = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v : Number(v)));

export const AppConfigSchema = z.object({
  appUrl: z.string().url().or(z.string().min(1)),
  /** Prefer APP_USERNAME — Windows sets USERNAME to the OS account name. */
  username: z.string().default(''),
  password: z.string().default(''),
  loginSelectorUser: z.string().default('input[name="username"]'),
  loginSelectorPass: z.string().default('input[name="password"]'),
  loginSelectorSubmit: z.string().default('button[type="submit"]'),

  figmaToken: z.string().default(''),
  figmaFileKey: z.string().default(''),
  figmaNodeId: z.string().default(''),

  openaiApiKey: z.string().default(''),
  openaiModel: z.string().default('gpt-4o'),
  aiProvider: z.enum(['openai', 'azure']).default('openai'),
  azureOpenAiEndpoint: z.string().default(''),
  azureOpenAiApiKey: z.string().default(''),
  azureOpenAiDeployment: z.string().default('gpt-4o'),
  azureOpenAiApiVersion: z.string().default('2024-08-01-preview'),

  pixelDiffThreshold: numberFromEnv.default(0.1),
  pixelDiffMaxPercent: numberFromEnv.default(2.5),
  aiVisionEnabled: boolFromEnv.default(true),

  browser: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
  headless: boolFromEnv.default(true),
  navigationTimeoutMs: numberFromEnv.default(30000),
  screenshotDir: z.string().default('output/screenshots'),

  viewports: z
    .string()
    .default('1920x1080,1366x768,768x1024,390x844')
    .transform((raw): Viewport[] =>
      raw.split(',').map((part) => {
        const [w, h] = part.trim().split('x').map(Number);
        if (!w || !h) {
          throw new Error(`Invalid viewport: ${part}`);
        }
        return { name: `vp-${w}x${h}`, width: w, height: h };
      }),
    ),

  colorTolerance: numberFromEnv.default(8),
  spacingTolerancePx: numberFromEnv.default(4),
  fontSizeTolerancePx: numberFromEnv.default(1),

  jiraEnabled: boolFromEnv.default(false),
  jiraBaseUrl: z.string().default(''),
  jiraEmail: z.string().default(''),
  jiraToken: z.string().default(''),
  jiraProjectKey: z.string().default(''),

  outputDir: z.string().default('output'),
  reportTitle: z.string().default('UI Validation Report'),

  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  retryAttempts: numberFromEnv.default(3),
  retryDelayMs: numberFromEnv.default(1000),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
