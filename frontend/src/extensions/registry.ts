import type { Engine, Pt, ToolId } from '../engine';

export interface ToolPointer { doc: Pt; screen: Pt; button: number; shift: boolean; alt: boolean; mod: boolean; clicks: number }
export interface ViewInfo { zoom: number; dpr: number; width: number; height: number; toScreen(p: Pt): Pt; toDoc(p: Pt): Pt }
export interface Paint { accent: string; handle: string; antsA: string; antsB: string }
export interface ToolContext { engine: Engine; view(): ViewInfo; paint(): Paint; antsPhase(): number }

export type OptionSpec =
  | { kind: 'title'; text: string }
  | { kind: 'segment'; label?: string; choices: ReadonlyArray<{ id: string; label: string }>; get: () => string; set: (id: string) => void }
  | { kind: 'range'; label: string; min: number; max: number; step?: number; unit?: string; get: () => number; set: (v: number) => void }
  | { kind: 'toggle'; label: string; get: () => boolean; set: (v: boolean) => void }
  | { kind: 'select'; label: string; choices: ReadonlyArray<{ id: string; label: string }>; get: () => string; set: (id: string) => void }
  | { kind: 'readout'; label: string; get: () => string }
  | { kind: 'number'; label: string; min?: number; max?: number; step?: number; unit?: string; get: () => number | null; set: (v: number) => void }
  | { kind: 'button'; label: string; icon?: string; run: () => void };

export interface Tool {
  id: ToolId;
  label: string;
  key: string;
  order: number;
  icon(engine: Engine): string;
  hint(engine: Engine): string;
  cursor?(ctx: ToolContext, p: ToolPointer | null): string;
  down?(ctx: ToolContext, p: ToolPointer): void;
  move?(ctx: ToolContext, p: ToolPointer): void;
  up?(ctx: ToolContext, p: ToolPointer): void;
  hover?(ctx: ToolContext, p: ToolPointer | null): void;
  keydown?(ctx: ToolContext, e: KeyboardEvent): boolean;
  cancel?(ctx: ToolContext): void;
  overlay?(ctx: ToolContext, g: CanvasRenderingContext2D): void;
  options?(engine: Engine): OptionSpec[];
}

const tools = new Map<ToolId, Tool>();

export function registerTool(tool: Tool): void {
  if (tools.has(tool.id)) throw new Error(`duplicate tool: ${tool.id}`);
  tools.set(tool.id, tool);
}
export const toolList = (): Tool[] => [...tools.values()].sort((a, b) => a.order - b.order);
export const getTool = (id: ToolId): Tool | undefined => tools.get(id);
export const toolForKey = (key: string): Tool | undefined => toolList().find((t) => t.key === key.toUpperCase());
/** Every tool on a key, in toolbar order: J holds Spot Healing, the Healing Brush and Patch, cycled with Shift. */
export const toolsForKey = (key: string): Tool[] => toolList().filter((t) => t.key === key.toUpperCase());

export function digitOf(e: KeyboardEvent): number | null {
  return e.code.startsWith('Digit') ? Number(e.code.slice(5)) : null;
}

export function dashed(ctx: ToolContext, g: CanvasRenderingContext2D, trace: () => void): void {
  const pal = ctx.paint();
  const phase = ctx.antsPhase();
  g.save();
  g.lineWidth = 1;
  g.setLineDash([4, 4]);
  g.beginPath();
  trace();
  g.strokeStyle = pal.antsB;
  g.lineDashOffset = -phase;
  g.stroke();
  g.strokeStyle = pal.antsA;
  g.lineDashOffset = -phase + 4;
  g.stroke();
  g.restore();
}
