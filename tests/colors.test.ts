import { describe, expect, it } from 'vitest';
import {
  parseColor,
  colorToHex,
  colorsMatch,
  colorDistance,
  figmaColorToRgba,
  parsePx,
} from '../src/utils/colors.js';

describe('color utils', () => {
  it('parses hex and rgb', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#0f0')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 0.5,
    });
  });

  it('converts to hex', () => {
    expect(colorToHex({ r: 255, g: 0, b: 0, a: 1 })).toBe('#ff0000');
  });

  it('matches within tolerance', () => {
    const a = { r: 100, g: 100, b: 100, a: 1 };
    const b = { r: 105, g: 100, b: 100, a: 1 };
    expect(colorsMatch(a, b, 8)).toBe(true);
    expect(colorsMatch(a, { r: 200, g: 100, b: 100, a: 1 }, 8)).toBe(false);
    expect(colorDistance(a, b)).toBeCloseTo(5);
  });

  it('converts figma 0-1 channels', () => {
    expect(figmaColorToRgba({ r: 1, g: 0.5, b: 0, a: 1 })).toEqual({
      r: 255,
      g: 128,
      b: 0,
      a: 1,
    });
  });

  it('parses px values', () => {
    expect(parsePx('16px')).toBe(16);
    expect(parsePx('1.5px')).toBe(1.5);
    expect(parsePx('auto')).toBeNull();
  });
});
