/** Shared domain types for the UI Validation Agent */

export type Severity = 'critical' | 'major' | 'minor' | 'info';

export type IssueCategory =
  | 'missing-element'
  | 'color'
  | 'typography'
  | 'alignment'
  | 'spacing'
  | 'dimensions'
  | 'border-radius'
  | 'responsive'
  | 'visual-diff'
  | 'token-mismatch'
  | 'other';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface DesignToken {
  name: string;
  type: 'color' | 'typography' | 'spacing' | 'radius' | 'shadow' | 'other';
  value: string | number;
  unit?: string;
}

export interface TypographyStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  lineHeight?: number | string;
  letterSpacing?: number;
  textAlign?: string;
  color?: RgbaColor;
}

export interface DesignNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  bounds: BoundingBox;
  fills?: RgbaColor[];
  strokes?: RgbaColor[];
  cornerRadius?: number;
  opacity?: number;
  typography?: TypographyStyle;
  padding?: { top: number; right: number; bottom: number; left: number };
  children: DesignNode[];
  selectorHint?: string;
}

export interface DesignModel {
  fileKey: string;
  fileName: string;
  nodeId: string;
  name: string;
  width: number;
  height: number;
  tokens: DesignToken[];
  tree: DesignNode;
  imagePath?: string;
  fetchedAt: string;
}

export interface DomStyleSnapshot {
  selector: string;
  tagName: string;
  text?: string;
  bounds: BoundingBox;
  computed: {
    color?: string;
    backgroundColor?: string;
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string;
    lineHeight?: string;
    borderRadius?: string;
    margin?: string;
    padding?: string;
    width?: string;
    height?: string;
    display?: string;
    opacity?: string;
  };
}

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

export interface ValidationIssue {
  id: string;
  category: IssueCategory;
  severity: Severity;
  title: string;
  description: string;
  expected?: string;
  actual?: string;
  element?: string;
  bounds?: BoundingBox;
  viewport?: string;
  screenshotPath?: string;
  heatmapPath?: string;
  rootCause?: string;
  suggestedFix?: string;
  confidence?: number;
}

export interface PixelDiffResult {
  totalPixels: number;
  diffPixels: number;
  diffPercent: number;
  threshold: number;
  passed: boolean;
  diffImagePath: string;
  heatmapPath?: string;
}

export interface VisionDiffResult {
  summary: string;
  issues: ValidationIssue[];
  rawResponse?: string;
}

export interface TokenValidationResult {
  tokenName: string;
  type: DesignToken['type'];
  expected: string;
  actual: string;
  passed: boolean;
  delta?: number;
  element?: string;
  severity: Severity;
}

export interface ResponsiveResult {
  viewport: Viewport;
  screenshotPath: string;
  issues: ValidationIssue[];
  pixelDiff?: PixelDiffResult;
}

export interface ValidationRunResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  appUrl: string;
  screen?: string;
  figmaUrl?: string;
  design?: DesignModel;
  screenshots: string[];
  pixelDiff?: PixelDiffResult;
  visionDiff?: VisionDiffResult;
  tokenResults: TokenValidationResult[];
  responsiveResults: ResponsiveResult[];
  issues: ValidationIssue[];
  summary: {
    totalIssues: number;
    critical: number;
    major: number;
    minor: number;
    info: number;
    passed: boolean;
  };
  reportPaths?: {
    html?: string;
    json?: string;
    pdf?: string;
  };
  jiraIssues?: string[];
}

export interface LoginConfig {
  username: string;
  password: string;
  userSelector: string;
  passSelector: string;
  submitSelector: string;
}

export interface CliOptions {
  figmaUrl?: string;
  screen?: string;
  mode?: 'full' | 'figma' | 'responsive' | 'tokens' | 'visual';
  outputDir?: string;
  headless?: boolean;
  createJira?: boolean;
}
