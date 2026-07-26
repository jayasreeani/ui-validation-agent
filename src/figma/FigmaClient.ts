import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../../config/index.js';
import { logger, withRetry, ensureDir } from '../utils/index.js';
import type {
  FigmaFileResponse,
  FigmaImagesResponse,
  FigmaNodesResponse,
  ParsedFigmaUrl,
} from './types.js';

const FIGMA_API = 'https://api.figma.com/v1';

/**
 * Parse a Figma design URL into file key + optional node id.
 * Supports:
 *   https://www.figma.com/file/{key}/...
 *   https://www.figma.com/design/{key}/...?node-id=1-2
 */
export function parseFigmaUrl(url: string): ParsedFigmaUrl {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);
  const keyIndex = parts.findIndex((p) => p === 'file' || p === 'design' || p === 'proto');
  if (keyIndex < 0 || !parts[keyIndex + 1]) {
    throw new Error(`Unable to parse Figma file key from URL: ${url}`);
  }
  const fileKey = parts[keyIndex + 1];
  const nodeParam = u.searchParams.get('node-id') ?? undefined;
  const nodeId = nodeParam ? nodeParam.replace(/-/g, ':') : undefined;
  return { fileKey, nodeId };
}

export class FigmaClient {
  private readonly token: string;

  constructor(private readonly config: AppConfig) {
    this.token = config.figmaToken;
  }

  private assertToken(): void {
    if (!this.token) {
      throw new Error(
        'FIGMA_TOKEN is required. Set it in .env or environment variables.',
      );
    }
  }

  private async request<T>(path: string): Promise<T> {
    this.assertToken();
    return withRetry(
      async () => {
        const res = await fetch(`${FIGMA_API}${path}`, {
          headers: { 'X-Figma-Token': this.token },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(
            `Figma API ${res.status} ${res.statusText}: ${body.slice(0, 400)}`,
          );
        }
        return (await res.json()) as T;
      },
      {
        attempts: this.config.retryAttempts,
        delayMs: this.config.retryDelayMs,
        label: `Figma GET ${path}`,
      },
    );
  }

  async getFile(fileKey: string): Promise<FigmaFileResponse> {
    logger.info('Fetching Figma file', { fileKey });
    return this.request<FigmaFileResponse>(`/files/${fileKey}`);
  }

  async getNodes(fileKey: string, nodeIds: string[]): Promise<FigmaNodesResponse> {
    const ids = encodeURIComponent(nodeIds.join(','));
    logger.info('Fetching Figma nodes', { fileKey, nodeIds });
    return this.request<FigmaNodesResponse>(
      `/files/${fileKey}/nodes?ids=${ids}`,
    );
  }

  async exportNodePng(
    fileKey: string,
    nodeId: string,
    outputDir: string,
    scale = 2,
  ): Promise<string> {
    const ids = encodeURIComponent(nodeId);
    logger.info('Exporting Figma node as PNG', { fileKey, nodeId, scale });
    const data = await this.request<FigmaImagesResponse>(
      `/images/${fileKey}?ids=${ids}&format=png&scale=${scale}`,
    );
    if (data.err) {
      throw new Error(`Figma image export error: ${data.err}`);
    }
    const imageUrl = data.images[nodeId];
    if (!imageUrl) {
      throw new Error(`No image URL returned for node ${nodeId}`);
    }

    await ensureDir(outputDir);
    const outPath = join(outputDir, `figma-${nodeId.replace(/:/g, '-')}.png`);

    const imgRes = await withRetry(
      async () => {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error(`Failed to download Figma PNG: ${res.status}`);
        return res;
      },
      {
        attempts: this.config.retryAttempts,
        delayMs: this.config.retryDelayMs,
        label: 'Figma PNG download',
      },
    );

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    await writeFile(outPath, buffer);
    logger.info('Saved Figma PNG', { outPath });
    return outPath;
  }
}
