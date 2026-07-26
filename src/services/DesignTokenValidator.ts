import type { AppConfig } from '../../config/index.js';
import { flattenDesignNodes } from '../figma/index.js';
import type {
  DesignModel,
  DesignNode,
  DomStyleSnapshot,
  Severity,
  TokenValidationResult,
  ValidationIssue,
} from '../types/index.js';
import {
  colorToHex,
  colorsMatch,
  logger,
  parseColor,
  parsePx,
} from '../utils/index.js';

function severityForDelta(delta: number, tolerance: number): Severity {
  if (delta <= tolerance) return 'info';
  if (delta <= tolerance * 2) return 'minor';
  if (delta <= tolerance * 4) return 'major';
  return 'critical';
}

function findBestDomMatch(
  node: DesignNode,
  dom: DomStyleSnapshot[],
): DomStyleSnapshot | undefined {
  const name = node.name.toLowerCase();
  const byText = dom.find(
    (d) => d.text && name && d.text.toLowerCase().includes(name.slice(0, 40)),
  );
  if (byText) return byText;

  const byTestId = dom.find((d) =>
    d.selector.toLowerCase().includes(
      name.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    ),
  );
  if (byTestId) return byTestId;

  // Spatial proximity fallback
  let best: DomStyleSnapshot | undefined;
  let bestScore = Infinity;
  for (const d of dom) {
    const dx = Math.abs(d.bounds.x - node.bounds.x);
    const dy = Math.abs(d.bounds.y - node.bounds.y);
    const dw = Math.abs(d.bounds.width - node.bounds.width);
    const dh = Math.abs(d.bounds.height - node.bounds.height);
    const score = dx + dy + dw * 0.5 + dh * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return bestScore < 120 ? best : undefined;
}

export class DesignTokenValidator {
  constructor(private readonly config: AppConfig) {}

  validate(
    design: DesignModel,
    domStyles: DomStyleSnapshot[],
  ): { tokenResults: TokenValidationResult[]; issues: ValidationIssue[] } {
    logger.info('Validating design tokens against DOM', {
      tokens: design.tokens.length,
      domElements: domStyles.length,
    });

    const tokenResults: TokenValidationResult[] = [];
    const issues: ValidationIssue[] = [];
    const nodes = flattenDesignNodes(design.tree).filter(
      (n) =>
        n.visible &&
        n.type !== 'DOCUMENT' &&
        n.type !== 'CANVAS' &&
        (n.bounds.width > 0 || n.bounds.height > 0),
    );

    for (const node of nodes) {
      const match = findBestDomMatch(node, domStyles);

      if (!match && node.type !== 'GROUP' && node.type !== 'FRAME') {
        issues.push({
          id: `missing-${node.id}`,
          category: 'missing-element',
          severity: 'major',
          title: `Missing element: ${node.name}`,
          description: `Design node "${node.name}" (${node.type}) was not found in the DOM.`,
          expected: node.name,
          actual: 'not found',
          element: node.selectorHint,
          bounds: node.bounds,
        });
        continue;
      }

      if (!match) continue;

      // Colors
      if (node.fills?.[0] && node.fills[0].a > 0) {
        const expected = colorToHex(node.fills[0]);
        const actualBg = parseColor(match.computed.backgroundColor ?? '');
        const actualFg = parseColor(match.computed.color ?? '');
        const actual =
          actualBg && actualBg.a > 0
            ? actualBg
            : actualFg && actualFg.a > 0
              ? actualFg
              : null;

        if (actual) {
          const passed = colorsMatch(
            node.fills[0],
            actual,
            this.config.colorTolerance,
          );
          const delta = Math.sqrt(
            (node.fills[0].r - actual.r) ** 2 +
              (node.fills[0].g - actual.g) ** 2 +
              (node.fills[0].b - actual.b) ** 2,
          );
          const result: TokenValidationResult = {
            tokenName: `color/${node.name}`,
            type: 'color',
            expected,
            actual: colorToHex(actual),
            passed,
            delta,
            element: match.selector,
            severity: passed
              ? 'info'
              : severityForDelta(delta, this.config.colorTolerance),
          };
          tokenResults.push(result);
          if (!passed) {
            issues.push({
              id: `color-${node.id}`,
              category: 'color',
              severity: result.severity,
              title: `Color mismatch: ${node.name}`,
              description: `Expected ${expected}, got ${result.actual}`,
              expected,
              actual: result.actual,
              element: match.selector,
              bounds: match.bounds,
              suggestedFix: `Update CSS color/background to ${expected} (or matching design token).`,
            });
          }
        }
      }

      // Typography
      if (node.typography?.fontSize !== undefined) {
        const actualSize = parsePx(match.computed.fontSize);
        if (actualSize !== null) {
          const delta = Math.abs(actualSize - node.typography.fontSize);
          const passed = delta <= this.config.fontSizeTolerancePx;
          tokenResults.push({
            tokenName: `fontSize/${node.name}`,
            type: 'typography',
            expected: `${node.typography.fontSize}px`,
            actual: `${actualSize}px`,
            passed,
            delta,
            element: match.selector,
            severity: passed
              ? 'info'
              : severityForDelta(delta, this.config.fontSizeTolerancePx),
          });
          if (!passed) {
            issues.push({
              id: `font-${node.id}`,
              category: 'typography',
              severity: severityForDelta(delta, this.config.fontSizeTolerancePx),
              title: `Font size mismatch: ${node.name}`,
              description: `Expected ${node.typography.fontSize}px, got ${actualSize}px`,
              expected: `${node.typography.fontSize}px`,
              actual: `${actualSize}px`,
              element: match.selector,
              bounds: match.bounds,
              suggestedFix: `Set font-size: ${node.typography.fontSize}px;`,
            });
          }
        }

        if (node.typography.fontFamily && match.computed.fontFamily) {
          const expectedFamily = node.typography.fontFamily.toLowerCase();
          const actualFamily = match.computed.fontFamily.toLowerCase();
          const passed = actualFamily.includes(expectedFamily.split(',')[0].trim());
          tokenResults.push({
            tokenName: `fontFamily/${node.name}`,
            type: 'typography',
            expected: node.typography.fontFamily,
            actual: match.computed.fontFamily,
            passed,
            element: match.selector,
            severity: passed ? 'info' : 'minor',
          });
          if (!passed) {
            issues.push({
              id: `fontfamily-${node.id}`,
              category: 'typography',
              severity: 'minor',
              title: `Font family mismatch: ${node.name}`,
              description: `Expected ${node.typography.fontFamily}, got ${match.computed.fontFamily}`,
              expected: node.typography.fontFamily,
              actual: match.computed.fontFamily,
              element: match.selector,
              suggestedFix: `Set font-family: "${node.typography.fontFamily}", ...;`,
            });
          }
        }
      }

      // Border radius
      if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
        const actualRadius = parsePx(match.computed.borderRadius?.split(' ')[0]);
        if (actualRadius !== null) {
          const delta = Math.abs(actualRadius - node.cornerRadius);
          const passed = delta <= this.config.spacingTolerancePx;
          tokenResults.push({
            tokenName: `radius/${node.name}`,
            type: 'radius',
            expected: `${node.cornerRadius}px`,
            actual: `${actualRadius}px`,
            passed,
            delta,
            element: match.selector,
            severity: passed ? 'info' : 'minor',
          });
          if (!passed) {
            issues.push({
              id: `radius-${node.id}`,
              category: 'border-radius',
              severity: 'minor',
              title: `Border radius mismatch: ${node.name}`,
              description: `Expected ${node.cornerRadius}px, got ${actualRadius}px`,
              expected: `${node.cornerRadius}px`,
              actual: `${actualRadius}px`,
              element: match.selector,
              suggestedFix: `Set border-radius: ${node.cornerRadius}px;`,
            });
          }
        }
      }

      // Dimensions
      if (node.bounds.width > 0 && node.bounds.height > 0) {
        const dw = Math.abs(match.bounds.width - node.bounds.width);
        const dh = Math.abs(match.bounds.height - node.bounds.height);
        const tol = Math.max(this.config.spacingTolerancePx * 2, 8);
        if (dw > tol || dh > tol) {
          issues.push({
            id: `dim-${node.id}`,
            category: 'dimensions',
            severity: severityForDelta(Math.max(dw, dh), tol),
            title: `Dimension mismatch: ${node.name}`,
            description: `Expected ${Math.round(node.bounds.width)}×${Math.round(node.bounds.height)}, got ${Math.round(match.bounds.width)}×${Math.round(match.bounds.height)}`,
            expected: `${Math.round(node.bounds.width)}x${Math.round(node.bounds.height)}`,
            actual: `${Math.round(match.bounds.width)}x${Math.round(match.bounds.height)}`,
            element: match.selector,
            bounds: match.bounds,
            suggestedFix: `Adjust width/height or layout constraints to match the design.`,
          });
        }
      }

      // Padding
      if (node.padding) {
        const padParts = (match.computed.padding ?? '0')
          .split(' ')
          .map((p) => parsePx(p) ?? 0);
        const [pt, pr, pb, pl] =
          padParts.length === 1
            ? [padParts[0], padParts[0], padParts[0], padParts[0]]
            : padParts.length === 2
              ? [padParts[0], padParts[1], padParts[0], padParts[1]]
              : padParts.length === 3
                ? [padParts[0], padParts[1], padParts[2], padParts[1]]
                : [
                    padParts[0] ?? 0,
                    padParts[1] ?? 0,
                    padParts[2] ?? 0,
                    padParts[3] ?? 0,
                  ];

        const checks: Array<[string, number, number]> = [
          ['top', node.padding.top, pt],
          ['right', node.padding.right, pr],
          ['bottom', node.padding.bottom, pb],
          ['left', node.padding.left, pl],
        ];

        for (const [side, expected, actual] of checks) {
          const delta = Math.abs(expected - actual);
          if (delta > this.config.spacingTolerancePx) {
            issues.push({
              id: `pad-${side}-${node.id}`,
              category: 'spacing',
              severity: severityForDelta(delta, this.config.spacingTolerancePx),
              title: `Padding ${side} mismatch: ${node.name}`,
              description: `Expected padding-${side} ${expected}px, got ${actual}px`,
              expected: `${expected}px`,
              actual: `${actual}px`,
              element: match.selector,
              suggestedFix: `Set padding-${side}: ${expected}px;`,
            });
          }
        }
      }

      // Alignment (x position for siblings-ish — flag large x/y drift)
      const dx = Math.abs(match.bounds.x - node.bounds.x);
      const dy = Math.abs(match.bounds.y - node.bounds.y);
      const alignTol = this.config.spacingTolerancePx * 3;
      if (dx > alignTol || dy > alignTol) {
        issues.push({
          id: `align-${node.id}`,
          category: 'alignment',
          severity: 'minor',
          title: `Alignment drift: ${node.name}`,
          description: `Element position differs by Δx=${Math.round(dx)}px, Δy=${Math.round(dy)}px`,
          expected: `x=${Math.round(node.bounds.x)}, y=${Math.round(node.bounds.y)}`,
          actual: `x=${Math.round(match.bounds.x)}, y=${Math.round(match.bounds.y)}`,
          element: match.selector,
          bounds: match.bounds,
          suggestedFix: 'Adjust layout (flex/grid/margins) to match Figma coordinates.',
        });
      }
    }

    logger.info('Token validation complete', {
      tokenResults: tokenResults.length,
      issues: issues.length,
    });

    return { tokenResults, issues };
  }
}
