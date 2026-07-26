import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { PixelDiffResult } from '../types/index.js';
import { ensureDir, logger } from '../utils/index.js';

async function readPng(path: string): Promise<PNG> {
  const buffer = await readFile(path);
  return PNG.sync.read(buffer);
}

function resizeToMatch(source: PNG, width: number, height: number): PNG {
  if (source.width === width && source.height === height) return source;
  const out = new PNG({ width, height });
  // Nearest-neighbor resize for deterministic comparison
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(source.width - 1, Math.floor((x / width) * source.width));
      const sy = Math.min(
        source.height - 1,
        Math.floor((y / height) * source.height),
      );
      const si = (source.width * sy + sx) << 2;
      const di = (width * y + x) << 2;
      out.data[di] = source.data[si];
      out.data[di + 1] = source.data[si + 1];
      out.data[di + 2] = source.data[si + 2];
      out.data[di + 3] = source.data[si + 3];
    }
  }
  return out;
}

/**
 * Build a simple red heatmap highlighting differing pixels.
 */
function buildHeatmap(diff: PNG): PNG {
  const heat = new PNG({ width: diff.width, height: diff.height });
  for (let i = 0; i < diff.data.length; i += 4) {
    const isDiff = diff.data[i] > 0 || diff.data[i + 1] > 0 || diff.data[i + 2] > 0;
    if (isDiff) {
      heat.data[i] = 255;
      heat.data[i + 1] = 40;
      heat.data[i + 2] = 40;
      heat.data[i + 3] = 200;
    } else {
      heat.data[i] = 0;
      heat.data[i + 1] = 0;
      heat.data[i + 2] = 0;
      heat.data[i + 3] = 0;
    }
  }
  return heat;
}

export interface PixelCompareOptions {
  threshold?: number;
  maxDiffPercent?: number;
  outputDir: string;
  name?: string;
}

export class PixelComparer {
  async compare(
    baselinePath: string,
    actualPath: string,
    options: PixelCompareOptions,
  ): Promise<PixelDiffResult> {
    const threshold = options.threshold ?? 0.1;
    const maxDiffPercent = options.maxDiffPercent ?? 2.5;
    const name = options.name ?? 'diff';

    logger.info('Running pixel comparison', { baselinePath, actualPath });

    let img1 = await readPng(baselinePath);
    let img2 = await readPng(actualPath);

    const width = Math.max(img1.width, img2.width);
    const height = Math.max(img1.height, img2.height);
    img1 = resizeToMatch(img1, width, height);
    img2 = resizeToMatch(img2, width, height);

    const diff = new PNG({ width, height });
    const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
      threshold,
      includeAA: true,
    });

    const totalPixels = width * height;
    const diffPercent = (diffPixels / totalPixels) * 100;
    const passed = diffPercent <= maxDiffPercent;

    await ensureDir(options.outputDir);
    const diffImagePath = join(options.outputDir, `${name}-pixel-diff.png`);
    const heatmapPath = join(options.outputDir, `${name}-heatmap.png`);

    await writeFile(diffImagePath, PNG.sync.write(diff));
    await writeFile(heatmapPath, PNG.sync.write(buildHeatmap(diff)));

    const result: PixelDiffResult = {
      totalPixels,
      diffPixels,
      diffPercent: Number(diffPercent.toFixed(4)),
      threshold,
      passed,
      diffImagePath,
      heatmapPath,
    };

    logger.info('Pixel comparison complete', {
      diffPixels,
      diffPercent: result.diffPercent,
      passed,
    });

    return result;
  }
}

export async function overlayHeatmapOnScreenshot(
  screenshotPath: string,
  heatmapPath: string,
  outputPath: string,
): Promise<string> {
  const shot = await readPng(screenshotPath);
  const heat = resizeToMatch(await readPng(heatmapPath), shot.width, shot.height);
  const out = new PNG({ width: shot.width, height: shot.height });

  for (let i = 0; i < shot.data.length; i += 4) {
    const ha = heat.data[i + 3] / 255;
    if (ha > 0) {
      out.data[i] = Math.round(shot.data[i] * (1 - ha) + heat.data[i] * ha);
      out.data[i + 1] = Math.round(shot.data[i + 1] * (1 - ha) + heat.data[i + 1] * ha);
      out.data[i + 2] = Math.round(shot.data[i + 2] * (1 - ha) + heat.data[i + 2] * ha);
      out.data[i + 3] = 255;
    } else {
      out.data[i] = shot.data[i];
      out.data[i + 1] = shot.data[i + 1];
      out.data[i + 2] = shot.data[i + 2];
      out.data[i + 3] = shot.data[i + 3];
    }
  }

  await ensureDir(dirname(outputPath));
  await writeFile(outputPath, PNG.sync.write(out));
  return outputPath;
}
