import { registerTool } from '../registry';
import { moveTool } from './move';
import { marqueeTool } from './marquee';
import { lassoTool } from './lasso';
import { wandTool } from './wand';
import { brushTool } from './brush';
import { eyedropperTool } from './eyedropper';
import { handTool } from './hand';
import { zoomTool } from './zoom';

export function registerBuiltinTools(): void {
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, brushTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
}
