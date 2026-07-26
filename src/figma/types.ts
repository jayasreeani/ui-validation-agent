/** Raw Figma REST API response shapes (subset we care about). */

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontPostScriptName?: string;
  fontWeight?: number;
  fontSize?: number;
  letterSpacing?: number;
  lineHeightPx?: number;
  lineHeightPercent?: number;
  textAlignHorizontal?: string;
}

export interface FigmaAbsoluteBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  opacity?: number;
  absoluteBoundingBox?: FigmaAbsoluteBoundingBox;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  characters?: string;
  style?: FigmaTypeStyle;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  children?: FigmaNode[];
}

export interface FigmaFileResponse {
  name: string;
  lastModified: string;
  document: FigmaNode;
  components?: Record<string, unknown>;
  styles?: Record<string, { name: string; styleType: string }>;
}

export interface FigmaNodesResponse {
  name: string;
  nodes: Record<
    string,
    {
      document: FigmaNode;
      components?: Record<string, unknown>;
    } | null
  >;
}

export interface FigmaImagesResponse {
  err: string | null;
  images: Record<string, string | null>;
}

export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId?: string;
}
