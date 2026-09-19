import { registerTool } from '../registry';
import { moveTool } from './move';
import { marqueeTool } from './marquee';
import { lassoTool } from './lasso';
import { wandTool } from './wand';
import { brushTool } from './brush';
import { eyedropperTool } from './eyedropper';
import { handTool } from './hand';
import { zoomTool } from './zoom';
import { cropTool } from './crop';
import { gradientTool } from './gradient';
import { shapeTool } from './shape';

export function registerBuiltinTools(): void {
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, gradientTool, shapeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
}
