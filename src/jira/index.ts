export { JiraClient } from './JiraClient.js';
export type { JiraCreatedIssue } from './JiraClient.js';

/** Optional Azure DevOps work item stub — interface only. */
export interface AzureDevOpsClient {
  createBug(title: string, description: string): Promise<{ id: number; url: string }>;
}

/** Optional MFA / SSO login hook — implement per environment. */
export interface MfaLoginHandler {
  handleMfa(page: unknown): Promise<void>;
}
