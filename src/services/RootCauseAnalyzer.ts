import type { VisionComparer } from '../vision/index.js';
import type { ValidationIssue } from '../types/index.js';
import { logger } from '../utils/index.js';

/**
 * Enriches validation issues with AI root-cause analysis and suggested fixes.
 * Falls back to heuristic suggestions when AI is unavailable.
 */
export class RootCauseAnalyzer {
  constructor(private readonly vision: VisionComparer) {}

  async enrich(
    issues: ValidationIssue[],
    screenshotPath?: string,
    options?: { maxAiIssues?: number },
  ): Promise<ValidationIssue[]> {
    const maxAi = options?.maxAiIssues ?? 8;
    const enriched: ValidationIssue[] = [];
    let aiCount = 0;

    for (const issue of issues) {
      if (issue.rootCause && issue.suggestedFix) {
        enriched.push(issue);
        continue;
      }

      if (
        this.vision.isEnabled() &&
        aiCount < maxAi &&
        (issue.severity === 'critical' || issue.severity === 'major')
      ) {
        try {
          const analysis = await this.vision.analyzeRootCause(
            issue,
            screenshotPath,
          );
          aiCount += 1;
          enriched.push({
            ...issue,
            rootCause: analysis.rootCause,
            suggestedFix: analysis.suggestedFix,
          });
          continue;
        } catch (error) {
          logger.warn('Root cause AI failed; using heuristic', {
            id: issue.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      enriched.push({
        ...issue,
        rootCause: issue.rootCause ?? heuristicRootCause(issue),
        suggestedFix: issue.suggestedFix ?? heuristicFix(issue),
      });
    }

    return enriched;
  }
}

function heuristicRootCause(issue: ValidationIssue): string {
  switch (issue.category) {
    case 'color':
      return 'Computed color does not match the Figma fill/token — likely hard-coded CSS or wrong theme token.';
    case 'typography':
      return 'Font token not applied; base styles or inheritance may override design specs.';
    case 'spacing':
    case 'alignment':
      return 'Layout spacing differs from design — check flex/grid gaps, margins, and padding tokens.';
    case 'missing-element':
      return 'Element present in design is absent from DOM — feature not implemented or wrong route/state.';
    case 'responsive':
      return 'Breakpoint styles incomplete; fixed widths or missing media queries causing overflow/regression.';
    case 'dimensions':
      return 'Element box model differs from design constraints.';
    default:
      return 'Visual discrepancy between design specification and rendered UI.';
  }
}

function heuristicFix(issue: ValidationIssue): string {
  if (issue.suggestedFix) return issue.suggestedFix;
  switch (issue.category) {
    case 'color':
      return `Apply design token color${issue.expected ? ` (${issue.expected})` : ''} via CSS variable or theme.`;
    case 'typography':
      return 'Align font-size / font-family / font-weight with typography tokens from Figma.';
    case 'spacing':
      return 'Update padding/margin to match spacing scale from the design system.';
    case 'missing-element':
      return `Implement or reveal element "${issue.expected ?? issue.element ?? 'unknown'}".`;
    case 'responsive':
      return 'Add/adjust media queries and fluid widths for the failing viewport.';
    default:
      return 'Compare computed styles with Figma and update CSS accordingly.';
  }
}
