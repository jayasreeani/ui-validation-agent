import type { AppConfig } from '../../config/index.js';
import { logger, ensureDir, writeJson, resolveOutputPath } from '../utils/index.js';
import type { DesignModel } from '../types/index.js';
import { FigmaClient, parseFigmaUrl } from './FigmaClient.js';
import { parseFigmaToDesignModel } from './FigmaParser.js';

export class FigmaService {
  private readonly client: FigmaClient;

  constructor(private readonly config: AppConfig) {
    this.client = new FigmaClient(config);
  }

  /**
   * Load a design model from a Figma URL or config fileKey/nodeId.
   */
  async loadDesign(figmaUrl?: string): Promise<DesignModel> {
    let fileKey = this.config.figmaFileKey;
    let nodeId = this.config.figmaNodeId;

    if (figmaUrl) {
      const parsed = parseFigmaUrl(figmaUrl);
      fileKey = parsed.fileKey;
      if (parsed.nodeId) nodeId = parsed.nodeId;
    }

    if (!fileKey) {
      throw new Error(
        'Figma file key is required. Pass --figma-url or set FIGMA_FILE_KEY.',
      );
    }

    const imageDir = resolveOutputPath(this.config.outputDir, 'figma');
    await ensureDir(imageDir);

    let rootNode;
    let fileName: string;

    if (nodeId) {
      const nodes = await this.client.getNodes(fileKey, [nodeId]);
      const entry = nodes.nodes[nodeId];
      if (!entry?.document) {
        throw new Error(`Figma node ${nodeId} not found in file ${fileKey}`);
      }
      rootNode = entry.document;
      fileName = nodes.name;
    } else {
      const file = await this.client.getFile(fileKey);
      rootNode = file.document;
      fileName = file.name;
      nodeId = file.document.id;
    }

    let imagePath: string | undefined;
    try {
      imagePath = await this.client.exportNodePng(fileKey, nodeId, imageDir);
    } catch (error) {
      logger.warn('Could not export Figma PNG (continuing without baseline image)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const model = parseFigmaToDesignModel({
      fileKey,
      fileName,
      nodeId,
      root: rootNode,
      imagePath,
    });

    const modelPath = resolveOutputPath(
      this.config.outputDir,
      'figma',
      'design-model.json',
    );
    await writeJson(modelPath, model);
    logger.info('Design model saved', { modelPath, tokens: model.tokens.length });

    return model;
  }
}

export { FigmaClient, parseFigmaUrl } from './FigmaClient.js';
export { parseFigmaToDesignModel, flattenDesignNodes } from './FigmaParser.js';
export type * from './types.js';
