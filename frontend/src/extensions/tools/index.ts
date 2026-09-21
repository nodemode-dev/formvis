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
import { typeTool } from './type';
import { healTool } from './heal';
import { cloneTool } from './clone';
import { smearTool } from './smear';

export function registerBuiltinTools(): void {
  for (const tool of [moveTool, marqueeTool, lassoTool, wandTool, cropTool, brushTool, healTool, cloneTool, smearTool, gradientTool, shapeTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
}
