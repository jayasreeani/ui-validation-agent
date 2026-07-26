import { readFile } from 'node:fs/promises';
import OpenAI, { AzureOpenAI } from 'openai';
import type { AppConfig } from '../../config/index.js';
import type { ValidationIssue, VisionDiffResult } from '../types/index.js';
import { logger, withRetry } from '../utils/index.js';

function createClient(config: AppConfig): OpenAI {
  if (config.aiProvider === 'azure') {
    if (!config.azureOpenAiEndpoint || !config.azureOpenAiApiKey) {
      throw new Error(
        'Azure OpenAI requires AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY',
      );
    }
    return new AzureOpenAI({
      endpoint: config.azureOpenAiEndpoint,
      apiKey: config.azureOpenAiApiKey,
      apiVersion: config.azureOpenAiApiVersion,
      deployment: config.azureOpenAiDeployment,
    });
  }
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is required for AI vision comparison');
  }
  return new OpenAI({ apiKey: config.openaiApiKey });
}

async function toDataUrl(imagePath: string): Promise<string> {
  const buf = await readFile(imagePath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const SYSTEM_PROMPT = `You are an expert UI/UX QA engineer comparing a Figma design (image 1) with a live application screenshot (image 2).
Identify visual discrepancies including:
- Missing or extra UI elements
- Color mismatches
- Typography (font family, size, weight)
- Alignment and layout shifts
- Padding/spacing/margin differences
- Incorrect dimensions or border radius
- Responsive/overflow issues visible in the screenshot

Respond ONLY with valid JSON matching this schema:
{
  "summary": "string",
  "issues": [
    {
      "category": "missing-element|color|typography|alignment|spacing|dimensions|border-radius|responsive|visual-diff|other",
      "severity": "critical|major|minor|info",
      "title": "string",
      "description": "string",
      "expected": "string",
      "actual": "string",
      "element": "string",
      "rootCause": "string",
      "suggestedFix": "string",
      "confidence": 0.0
    }
  ]
}`;

export class VisionComparer {
  private readonly client: OpenAI | null;

  constructor(private readonly config: AppConfig) {
    this.client =
      config.aiVisionEnabled &&
      (config.openaiApiKey || config.azureOpenAiApiKey)
        ? createClient(config)
        : null;
  }

  isEnabled(): boolean {
    return this.client !== null && this.config.aiVisionEnabled;
  }

  async compare(
    designImagePath: string,
    actualImagePath: string,
    context?: { screen?: string; designName?: string },
  ): Promise<VisionDiffResult> {
    if (!this.client) {
      logger.warn('AI vision disabled or missing API keys — skipping');
      return {
        summary: 'AI vision comparison skipped (disabled or no API key)',
        issues: [],
      };
    }

    const model =
      this.config.aiProvider === 'azure'
        ? this.config.azureOpenAiDeployment
        : this.config.openaiModel;

    logger.info('Running GPT-4o vision comparison', { model });

    const [designUrl, actualUrl] = await Promise.all([
      toDataUrl(designImagePath),
      toDataUrl(actualImagePath),
    ]);

    const userText = [
      context?.designName ? `Design frame: ${context.designName}` : null,
      context?.screen ? `Screen / route: ${context.screen}` : null,
      'Compare image 1 (Figma design) with image 2 (live UI). List concrete issues.',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await withRetry(
      () =>
        this.client!.chat.completions.create({
          model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: userText },
                { type: 'image_url', image_url: { url: designUrl, detail: 'high' } },
                { type: 'image_url', image_url: { url: actualUrl, detail: 'high' } },
              ],
            },
          ],
          max_tokens: 2500,
        }),
      {
        attempts: this.config.retryAttempts,
        delayMs: this.config.retryDelayMs,
        label: 'OpenAI vision compare',
      },
    );

    const raw = response.choices[0]?.message?.content ?? '{}';
    return this.parseResponse(raw);
  }

  /**
   * Root-cause analysis for a single issue using vision + text context.
   */
  async analyzeRootCause(
    issue: ValidationIssue,
    screenshotPath?: string,
  ): Promise<{ rootCause: string; suggestedFix: string }> {
    if (!this.client) {
      return {
        rootCause: issue.rootCause ?? 'AI analysis unavailable',
        suggestedFix:
          issue.suggestedFix ??
          'Review the design token and CSS for the affected element.',
      };
    }

    const model =
      this.config.aiProvider === 'azure'
        ? this.config.azureOpenAiDeployment
        : this.config.openaiModel;

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: `Analyze this UI validation issue and suggest a concrete CSS/HTML fix.\nIssue: ${JSON.stringify(issue, null, 2)}\nRespond with JSON: {"rootCause":"...","suggestedFix":"..."}`,
      },
    ];

    if (screenshotPath) {
      content.push({
        type: 'image_url',
        image_url: { url: await toDataUrl(screenshotPath), detail: 'low' },
      });
    }

    const response = await withRetry(
      () =>
        this.client!.chat.completions.create({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You are a senior frontend engineer diagnosing UI bugs.',
            },
            { role: 'user', content },
          ],
          max_tokens: 800,
        }),
      {
        attempts: this.config.retryAttempts,
        delayMs: this.config.retryDelayMs,
        label: 'OpenAI root cause',
      },
    );

    try {
      const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as {
        rootCause?: string;
        suggestedFix?: string;
      };
      return {
        rootCause: parsed.rootCause ?? 'Unknown',
        suggestedFix: parsed.suggestedFix ?? 'Inspect element styles against design tokens.',
      };
    } catch {
      return {
        rootCause: 'Unable to parse AI response',
        suggestedFix: 'Manually compare computed styles with Figma specs.',
      };
    }
  }

  private parseResponse(raw: string): VisionDiffResult {
    try {
      const parsed = JSON.parse(raw) as {
        summary?: string;
        issues?: Array<Partial<ValidationIssue> & { category?: string; severity?: string }>;
      };

      const issues: ValidationIssue[] = (parsed.issues ?? []).map((issue, idx) => ({
        id: `vision-${idx + 1}`,
        category: (issue.category as ValidationIssue['category']) ?? 'visual-diff',
        severity: (issue.severity as ValidationIssue['severity']) ?? 'major',
        title: issue.title ?? `Vision issue ${idx + 1}`,
        description: issue.description ?? '',
        expected: issue.expected,
        actual: issue.actual,
        element: issue.element,
        rootCause: issue.rootCause,
        suggestedFix: issue.suggestedFix,
        confidence: issue.confidence,
      }));

      return {
        summary: parsed.summary ?? 'Vision comparison complete',
        issues,
        rawResponse: raw,
      };
    } catch (error) {
      logger.error('Failed to parse vision JSON', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        summary: 'Vision comparison returned unparseable output',
        issues: [
          {
            id: 'vision-parse-error',
            category: 'other',
            severity: 'info',
            title: 'Vision response parse error',
            description: raw.slice(0, 500),
          },
        ],
        rawResponse: raw,
      };
    }
  }
}
