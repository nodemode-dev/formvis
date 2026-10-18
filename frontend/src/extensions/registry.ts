import type { RGB } from '../engine';
import type { Engine, Pt, ToolId } from '../engine';
import type { PenPose } from '../engine/brush-dynamics';

export interface ToolPointer { doc: Pt; screen: Pt; button: number; shift: boolean; alt: boolean; mod: boolean; clicks: number; pressure: number; pose?: PenPose }
export interface ViewInfo { zoom: number; dpr: number; width: number; height: number; toScreen(p: Pt): Pt; toDoc(p: Pt): Pt }
export interface Paint { accent: string; handle: string; antsA: string; antsB: string }
export interface ToolContext { engine: Engine; view(): ViewInfo; paint(): Paint; antsPhase(): number }

export type OptionSpec = (
  | { kind: 'title'; text: string }
  | { kind: 'segment'; label?: string; choices: ReadonlyArray<{ id: string; label: string }>; get: () => string; set: (id: string) => void }
  | { kind: 'range'; label: string; min: number; max: number; step?: number; unit?: string; get: () => number; set: (v: number) => void }
  | { kind: 'toggle'; label: string; get: () => boolean; set: (v: boolean) => void }
  | { kind: 'select'; label: string; choices: ReadonlyArray<{ id: string; label: string }>; get: () => string; set: (id: string) => void; live?: () => ReadonlyArray<{ id: string; label: string }> }
  | { kind: 'readout'; label: string; get: () => string }
  /** A colour (Type's swatch, 1.50.4): the system picker, as a swatch in the bar. */
  | { kind: 'color'; label: string; get: () => RGB; set: (c: RGB) => void }
  | { kind: 'number'; label: string; min?: number; max?: number; step?: number; unit?: string; get: () => number | null; set: (v: number) => void }
  | { kind: 'button'; label: string; icon?: string; run: () => void; /** Icon only, the label as its tooltip (the target's align buttons). */ compact?: boolean }
) & {
  /** Shown only while this holds (checked on each sync); the row is built once either way. */
  when?: () => boolean;
};

/** A mode of one tool listed as its own entry in the toolbar's flyout, as Photoshop lists its sub-tools (the Elliptical
 *  Marquee, the Polygonal Lasso): its name and icon, whether it is the one in use, and how to pick it. */
export interface ToolVariant { id: string; label: string; icon: string; active(): boolean; pick(): void }

export interface Tool {
  id: ToolId;
  /** The slot it shares, when not its key's (Rotate View, R, sits with the Hand, as Photoshop's). */
  group?: string;
  /** The tool's modes as flyout entries (the owner's walkthrough: the marquee's ellipse, the lasso's kinds...). */
  variants?(engine: Engine): readonly ToolVariant[];
  label: string;
  key: string;
  order: number;
  hidden?: boolean;
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

const registry = new Map<ToolId, Tool>();

export function registerTool(tool: Tool): void {
  if (registry.has(tool.id)) throw new Error(`Tool "${tool.id}" is already registered`);
  registry.set(tool.id, tool);
}
export const toolList = (): Tool[] => [...registry.values()].sort((a, b) => a.order - b.order);
export const getTool = (id: ToolId): Tool | undefined => registry.get(id);
export const toolForKey = (key: string): Tool | undefined => toolList().find((t) => t.key === key.toUpperCase());
/** Every tool on a key, in toolbar order: J holds Spot Healing, the Healing Brush and Patch, cycled with Shift. */
export const toolsForKey = (key: string): Tool[] => toolList().filter((t) => t.key === key.toUpperCase());

/** The digit of a top-row number key, or null for any other key. */
export function digitOf(e: KeyboardEvent): number | null {
  const m = /^Digit([0-9])$/.exec(e.code);
  return m ? Number(m[1]) : null;
}

/** Marching ants: one traced path stroked twice in alternating colours, the dashes offset by the animation phase. */
export function dashed(ctx: ToolContext, g: CanvasRenderingContext2D, trace: () => void): void {
  const pal = ctx.paint(), phase = ctx.antsPhase();
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

/** Commands a tool's options bar can run (dialogs live with the app): the app connects it. */
export const toolHost = { run: (id: string): void => { void id; } };
