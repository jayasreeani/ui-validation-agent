import { BrowserAgent } from './BrowserAgent.js';

export { BrowserAgent } from './BrowserAgent.js';
export type { SupportedBrowser } from './BrowserAgent.js';

/** Convenience helper for one-shot screenshot workflows. */
export async function withBrowser<T>(
  agent: BrowserAgent,
  fn: (agent: BrowserAgent) => Promise<T>,
): Promise<T> {
  try {
    await agent.launch();
    return await fn(agent);
  } finally {
    await agent.close();
  }
}
