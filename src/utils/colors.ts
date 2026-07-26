import type { RgbaColor } from '../types/index.js';

/** Parse CSS / hex / rgb(a) color strings into RGBA 0–255. */
export function parseColor(input: string): RgbaColor | null {
  const value = input.trim().toLowerCase();

  if (value === 'transparent' || value === 'none') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const hasAlpha = h.length === 8;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = hasAlpha ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  const rgba = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  );
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] !== undefined ? Number(rgba[4]) : 1,
    };
  }

  return null;
}

export function colorToHex(c: RgbaColor): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  const base = `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
  if (c.a < 1) {
    return `${base}${toHex(c.a * 255)}`;
  }
  return base;
}

/** Euclidean RGB distance (ignores alpha unless both transparent). */
export function colorDistance(a: RgbaColor, b: RgbaColor): number {
  if (a.a === 0 && b.a === 0) return 0;
  return Math.sqrt(
    (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2,
  );
}

export function colorsMatch(
  a: RgbaColor,
  b: RgbaColor,
  tolerance = 8,
): boolean {
  return colorDistance(a, b) <= tolerance;
}

/** Convert Figma 0–1 channel color to 0–255 RGBA. */
export function figmaColorToRgba(c: {
  r: number;
  g: number;
  b: number;
  a?: number;
}): RgbaColor {
  return {
    r: Math.round(c.r * 255),
    g: Math.round(c.g * 255),
    b: Math.round(c.b * 255),
    a: c.a ?? 1,
  };
}

export function parsePx(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.trim().match(/^(-?[\d.]+)px$/i);
  if (m) return Number(m[1]);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
