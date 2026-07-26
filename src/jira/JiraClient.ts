import type { AppConfig } from '../../config/index.js';
import type { ValidationIssue } from '../types/index.js';
import { logger, withRetry } from '../utils/index.js';

export interface JiraCreatedIssue {
  key: string;
  id: string;
  self: string;
}

/**
 * Optional Jira Cloud REST integration.
 * Enabled when JIRA_ENABLED=true and credentials are set.
 */
export class JiraClient {
  constructor(private readonly config: AppConfig) {}

  isEnabled(): boolean {
    return (
      this.config.jiraEnabled &&
      Boolean(
        this.config.jiraBaseUrl &&
          this.config.jiraEmail &&
          this.config.jiraToken &&
          this.config.jiraProjectKey,
      )
    );
  }

  async createDefect(issue: ValidationIssue): Promise<JiraCreatedIssue | null> {
    if (!this.isEnabled()) {
      logger.debug('Jira disabled — skipping defect creation');
      return null;
    }

    const base = this.config.jiraBaseUrl.replace(/\/$/, '');
    const auth = Buffer.from(
      `${this.config.jiraEmail}:${this.config.jiraToken}`,
    ).toString('base64');

    const priority =
      issue.severity === 'critical'
        ? 'Highest'
        : issue.severity === 'major'
          ? 'High'
          : issue.severity === 'minor'
            ? 'Medium'
            : 'Low';

    const description = [
      issue.description,
      issue.expected ? `Expected: ${issue.expected}` : null,
      issue.actual ? `Actual: ${issue.actual}` : null,
      issue.element ? `Element: ${issue.element}` : null,
      issue.rootCause ? `Root cause: ${issue.rootCause}` : null,
      issue.suggestedFix ? `Suggested fix: ${issue.suggestedFix}` : null,
      issue.screenshotPath ? `Screenshot: ${issue.screenshotPath}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const body = {
      fields: {
        project: { key: this.config.jiraProjectKey },
        summary: `[UI Validation] ${issue.title}`.slice(0, 250),
        description,
        issuetype: { name: 'Bug' },
        priority: { name: priority },
        labels: ['ui-validation-agent', issue.category],
      },
    };

    return withRetry(
      async () => {
        const res = await fetch(`${base}/rest/api/2/issue`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Jira API ${res.status}: ${text.slice(0, 400)}`);
        }
        const data = (await res.json()) as JiraCreatedIssue;
        logger.info('Jira defect created', { key: data.key });
        return data;
      },
      {
        attempts: this.config.retryAttempts,
        delayMs: this.config.retryDelayMs,
        label: 'Jira create issue',
      },
    );
  }

  async createDefectsForIssues(
    issues: ValidationIssue[],
    options?: { severities?: Array<ValidationIssue['severity']>; limit?: number },
  ): Promise<string[]> {
    if (!this.isEnabled()) return [];

    const severities = options?.severities ?? ['critical', 'major'];
    const limit = options?.limit ?? 10;
    const candidates = issues
      .filter((i) => severities.includes(i.severity))
      .slice(0, limit);

    const keys: string[] = [];
    for (const issue of candidates) {
      try {
        const created = await this.createDefect(issue);
        if (created?.key) keys.push(created.key);
      } catch (error) {
        logger.error('Failed to create Jira defect', {
          issueId: issue.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return keys;
  }
}

/** Optional Azure DevOps work item stub — interface only. */
export interface AzureDevOpsClient {
  createBug(issue: ValidationIssue): Promise<{ id: number } | null>;
}

export class AzureDevOpsStub implements AzureDevOpsClient {
  async createBug(_issue: ValidationIssue): Promise<{ id: number } | null> {
    logger.info(
      'Azure DevOps integration is not configured (stub). Provide a real client to enable.',
    );
    return null;
  }
}

/** Optional MFA login hook — implement for SSO/MFA flows. */
export interface MfaHandler {
  handleMfa(page: unknown): Promise<void>;
}

export class NoOpMfaHandler implements MfaHandler {
  async handleMfa(): Promise<void> {
    // Intentionally empty — override for TOTP/push MFA if required.
  }
}
