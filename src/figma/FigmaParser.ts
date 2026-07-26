import type {
  DesignModel,
  DesignNode,
  DesignToken,
  RgbaColor,
  TypographyStyle,
} from '../types/index.js';
import { figmaColorToRgba, colorToHex } from '../utils/index.js';
import type { FigmaNode, FigmaPaint } from './types.js';

function paintsToColors(paints?: FigmaPaint[]): RgbaColor[] {
  if (!paints) return [];
  return paints
    .filter((p) => p.visible !== false && p.type === 'SOLID' && p.color)
    .map((p) => {
      const base = figmaColorToRgba(p.color!);
      return { ...base, a: base.a * (p.opacity ?? 1) };
    });
}

function mapTypography(node: FigmaNode): TypographyStyle | undefined {
  if (!node.style) return undefined;
  const fills = paintsToColors(node.fills);
  return {
    fontFamily: node.style.fontFamily,
    fontSize: node.style.fontSize,
    fontWeight: node.style.fontWeight,
    lineHeight: node.style.lineHeightPx,
    letterSpacing: node.style.letterSpacing,
    textAlign: node.style.textAlignHorizontal?.toLowerCase(),
    color: fills[0],
  };
}

function mapNode(node: FigmaNode, parentOffset = { x: 0, y: 0 }): DesignNode {
  const box = node.absoluteBoundingBox;
  const bounds = box
    ? {
        x: box.x - parentOffset.x,
        y: box.y - parentOffset.y,
        width: box.width,
        height: box.height,
      }
    : { x: 0, y: 0, width: 0, height: 0 };

  const rootOffset = box ? { x: box.x, y: box.y } : parentOffset;

  const hasPadding =
    node.paddingTop !== undefined ||
    node.paddingRight !== undefined ||
    node.paddingBottom !== undefined ||
    node.paddingLeft !== undefined;

  const designNode: DesignNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible !== false,
    bounds,
    fills: paintsToColors(node.fills),
    strokes: paintsToColors(node.strokes),
    cornerRadius: node.cornerRadius ?? node.rectangleCornerRadii?.[0],
    opacity: node.opacity,
    typography: mapTypography(node),
    padding: hasPadding
      ? {
          top: node.paddingTop ?? 0,
          right: node.paddingRight ?? 0,
          bottom: node.paddingBottom ?? 0,
          left: node.paddingLeft ?? 0,
        }
      : undefined,
    selectorHint: guessSelector(node),
    children: (node.children ?? []).map((child) => mapNode(child, rootOffset)),
  };

  return designNode;
}

function guessSelector(node: FigmaNode): string | undefined {
  const name = node.name.trim();
  if (!name) return undefined;
  // data-testid convention: "Login Button" -> login-button
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) return undefined;
  return `[data-testid="${slug}"], [aria-label="${name}"], text=${JSON.stringify(name)}`;
}

function collectTokens(root: DesignNode): DesignToken[] {
  const tokens: DesignToken[] = [];
  const seen = new Set<string>();

  const visit = (node: DesignNode): void => {
    for (const fill of node.fills ?? []) {
      if (fill.a === 0) continue;
      const hex = colorToHex(fill);
      const key = `color:${hex}`;
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push({
          name: `fill/${node.name}/${hex}`,
          type: 'color',
          value: hex,
        });
      }
    }

    if (node.typography?.fontSize !== undefined) {
      const key = `fontSize:${node.typography.fontSize}`;
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push({
          name: `typography/fontSize/${node.typography.fontSize}`,
          type: 'typography',
          value: node.typography.fontSize,
          unit: 'px',
        });
      }
    }

    if (node.typography?.fontFamily) {
      const key = `fontFamily:${node.typography.fontFamily}`;
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push({
          name: `typography/fontFamily/${node.typography.fontFamily}`,
          type: 'typography',
          value: node.typography.fontFamily,
        });
      }
    }

    if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
      const key = `radius:${node.cornerRadius}`;
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push({
          name: `radius/${node.cornerRadius}`,
          type: 'radius',
          value: node.cornerRadius,
          unit: 'px',
        });
      }
    }

    if (node.padding) {
      for (const [side, val] of Object.entries(node.padding)) {
        const key = `spacing:pad-${side}:${val}`;
        if (!seen.has(key) && val > 0) {
          seen.add(key);
          tokens.push({
            name: `spacing/padding-${side}/${val}`,
            type: 'spacing',
            value: val,
            unit: 'px',
          });
        }
      }
    }

    for (const child of node.children) visit(child);
  };

  visit(root);
  return tokens;
}

export interface ParseDesignOptions {
  fileKey: string;
  fileName: string;
  nodeId: string;
  root: FigmaNode;
  imagePath?: string;
}

/**
 * Convert a Figma node tree into the agent's DesignModel JSON.
 */
export function parseFigmaToDesignModel(options: ParseDesignOptions): DesignModel {
  const tree = mapNode(options.root);
  const box = options.root.absoluteBoundingBox;

  return {
    fileKey: options.fileKey,
    fileName: options.fileName,
    nodeId: options.nodeId,
    name: options.root.name,
    width: box?.width ?? tree.bounds.width,
    height: box?.height ?? tree.bounds.height,
    tokens: collectTokens(tree),
    tree,
    imagePath: options.imagePath,
    fetchedAt: new Date().toISOString(),
  };
}

/** Flatten design tree for matching / reporting. */
export function flattenDesignNodes(root: DesignNode): DesignNode[] {
  const out: DesignNode[] = [];
  const walk = (n: DesignNode): void => {
    out.push(n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}
