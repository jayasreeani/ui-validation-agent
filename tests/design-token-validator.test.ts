import { describe, expect, it } from 'vitest';
import { DesignTokenValidator } from '../src/services/DesignTokenValidator.js';
import type { AppConfig } from '../config/schema.js';
import type { DesignModel, DomStyleSnapshot } from '../src/types/index.js';

function minimalConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    appUrl: 'http://localhost:3000',
    username: '',
    password: '',
    loginSelectorUser: 'input[name="username"]',
    loginSelectorPass: 'input[name="password"]',
    loginSelectorSubmit: 'button[type="submit"]',
    figmaToken: '',
    figmaFileKey: '',
    figmaNodeId: '',
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    aiProvider: 'openai',
    azureOpenAiEndpoint: '',
    azureOpenAiApiKey: '',
    azureOpenAiDeployment: 'gpt-4o',
    azureOpenAiApiVersion: '2024-08-01-preview',
    pixelDiffThreshold: 0.1,
    pixelDiffMaxPercent: 2.5,
    aiVisionEnabled: false,
    browser: 'chromium',
    headless: true,
    navigationTimeoutMs: 30000,
    screenshotDir: 'output/screenshots',
    viewports: [{ name: 'vp-1920x1080', width: 1920, height: 1080 }],
    colorTolerance: 8,
    spacingTolerancePx: 4,
    fontSizeTolerancePx: 1,
    jiraEnabled: false,
    jiraBaseUrl: '',
    jiraEmail: '',
    jiraToken: '',
    jiraProjectKey: '',
    outputDir: 'output',
    reportTitle: 'Test',
    logLevel: 'error',
    retryAttempts: 1,
    retryDelayMs: 10,
    ...overrides,
  };
}

describe('DesignTokenValidator', () => {
  const design: DesignModel = {
    fileKey: 'f',
    fileName: 'F',
    nodeId: '1:1',
    name: 'Card',
    width: 200,
    height: 100,
    tokens: [],
    fetchedAt: new Date().toISOString(),
    tree: {
      id: '1:1',
      name: 'Card',
      type: 'FRAME',
      visible: true,
      bounds: { x: 0, y: 0, width: 200, height: 100 },
      fills: [{ r: 255, g: 0, b: 0, a: 1 }],
      cornerRadius: 8,
      typography: { fontSize: 16, fontFamily: 'Inter' },
      children: [
        {
          id: '1:2',
          name: 'Heading',
          type: 'TEXT',
          visible: true,
          bounds: { x: 10, y: 10, width: 100, height: 24 },
          typography: { fontSize: 16, fontFamily: 'Inter' },
          fills: [{ r: 0, g: 0, b: 0, a: 1 }],
          children: [],
        },
      ],
    },
  };

  it('flags color and typography mismatches', () => {
    const dom: DomStyleSnapshot[] = [
      {
        selector: '[data-testid="heading"]',
        tagName: 'h1',
        text: 'Heading',
        bounds: { x: 10, y: 10, width: 100, height: 24 },
        computed: {
          color: 'rgb(0, 0, 0)',
          backgroundColor: 'rgba(0, 0, 0, 0)',
          fontFamily: 'Arial',
          fontSize: '20px',
          fontWeight: '400',
          borderRadius: '0px',
          padding: '0px',
        },
      },
      {
        selector: '.card',
        tagName: 'div',
        text: 'Card',
        bounds: { x: 0, y: 0, width: 200, height: 100 },
        computed: {
          backgroundColor: 'rgb(0, 255, 0)',
          color: 'rgb(0, 0, 0)',
          fontFamily: 'Inter',
          fontSize: '16px',
          borderRadius: '8px',
          padding: '0px',
        },
      },
    ];

    const validator = new DesignTokenValidator(minimalConfig());
    const { issues } = validator.validate(design, dom);

    expect(issues.some((i) => i.category === 'color')).toBe(true);
    expect(issues.some((i) => i.category === 'typography')).toBe(true);
  });

  it('passes when styles align', () => {
    const dom: DomStyleSnapshot[] = [
      {
        selector: 'h1',
        tagName: 'h1',
        text: 'Heading text',
        bounds: { x: 10, y: 10, width: 100, height: 24 },
        computed: {
          color: 'rgb(0, 0, 0)',
          backgroundColor: 'rgba(0, 0, 0, 0)',
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
          borderRadius: '0px',
          padding: '0px',
        },
      },
      {
        selector: '.card',
        tagName: 'div',
        text: 'Card content',
        bounds: { x: 0, y: 0, width: 200, height: 100 },
        computed: {
          backgroundColor: 'rgb(255, 0, 0)',
          color: 'rgb(0, 0, 0)',
          fontFamily: 'Inter',
          fontSize: '16px',
          borderRadius: '8px',
          padding: '0px',
        },
      },
    ];

    const validator = new DesignTokenValidator(minimalConfig());
    const { issues } = validator.validate(design, dom);
    const colorIssues = issues.filter((i) => i.category === 'color');
    const fontIssues = issues.filter(
      (i) => i.category === 'typography' && i.title.includes('Font size'),
    );
    expect(colorIssues.length).toBe(0);
    expect(fontIssues.length).toBe(0);
  });
});
