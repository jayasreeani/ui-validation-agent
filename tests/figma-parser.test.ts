import { describe, it, expect } from 'vitest';
import { parseFigmaUrl } from '../src/figma/FigmaClient.js';
import { parseFigmaToDesignModel, flattenDesignNodes } from '../src/figma/FigmaParser.js';
import type { FigmaNode } from '../src/figma/types.js';

describe('parseFigmaUrl', () => {
  it('parses design URLs with node-id', () => {
    const result = parseFigmaUrl(
      'https://www.figma.com/design/AbCdEf123/MyFile?node-id=12-34&t=xyz',
    );
    expect(result.fileKey).toBe('AbCdEf123');
    expect(result.nodeId).toBe('12:34');
  });

  it('parses file URLs without node-id', () => {
    const result = parseFigmaUrl('https://www.figma.com/file/AbCdEf123/MyFile');
    expect(result.fileKey).toBe('AbCdEf123');
    expect(result.nodeId).toBeUndefined();
  });

  it('throws on invalid URLs', () => {
    expect(() => parseFigmaUrl('https://example.com/not-figma')).toThrow(/Unable to parse/);
  });
});

describe('Figma parser', () => {
  const sample: FigmaNode = {
    id: '1:1',
    name: 'Login Screen',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
    children: [
      {
        id: '1:2',
        name: 'Title',
        type: 'TEXT',
        characters: 'Welcome back',
        absoluteBoundingBox: { x: 100, y: 80, width: 200, height: 40 },
        fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1, a: 1 } }],
        style: {
          fontFamily: 'Inter',
          fontSize: 32,
          fontWeight: 700,
        },
      },
      {
        id: '1:3',
        name: 'PrimaryButton',
        type: 'FRAME',
        absoluteBoundingBox: { x: 100, y: 200, width: 160, height: 48 },
        cornerRadius: 8,
        fills: [{ type: 'SOLID', color: { r: 0.06, g: 0.43, b: 0.34, a: 1 } }],
        paddingTop: 12,
        paddingBottom: 12,
        paddingLeft: 24,
        paddingRight: 24,
      },
    ],
  };

  it('builds a design model with tokens', () => {
    const model = parseFigmaToDesignModel({
      fileKey: 'AbCdEf123',
      fileName: 'MyFile',
      nodeId: '1:1',
      root: sample,
    });

    expect(model.name).toBe('Login Screen');
    expect(model.width).toBe(1440);
    expect(model.tokens.length).toBeGreaterThan(0);
    expect(model.tokens.some((t) => t.type === 'color')).toBe(true);
    expect(model.tokens.some((t) => t.type === 'radius')).toBe(true);

    const flat = flattenDesignNodes(model.tree);
    expect(flat.some((n) => n.name === 'Title')).toBe(true);
    expect(flat.find((n) => n.name === 'PrimaryButton')?.cornerRadius).toBe(8);
  });

  it('maps relative bounds for children', () => {
    const model = parseFigmaToDesignModel({
      fileKey: 'AbCdEf123',
      fileName: 'MyFile',
      nodeId: '1:1',
      root: sample,
    });
    const title = model.tree.children.find((c) => c.name === 'Title');
    expect(title?.bounds).toEqual({ x: 100, y: 80, width: 200, height: 40 });
  });
});
