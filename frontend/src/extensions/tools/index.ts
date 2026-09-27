import { registerTool } from '../registry';
import { moveTool } from './move';
import { marqueeTool } from './marquee';
import { lassoTool } from './lasso';
import { wandTool } from './wand';
import { quickSelectTool } from './quick-select';
import { objectSelectTool } from './object-select';
import { brushTool } from './brush';
import { eyedropperTool } from './eyedropper';
import { handTool } from './hand';
import { zoomTool } from './zoom';
import { cropTool } from './crop';
import { gradientTool } from './gradient';
import { shapeTool } from './shape';
import { typeTool } from './type';
import { penTool } from './pen';
import { freeformPenTool } from './freeform-pen';
import { curvaturePenTool } from './curvature-pen';
import { directSelectTool } from './direct-select';
import { pathSelectTool } from './path-select';
import { healTool } from './heal';
import { removeTool } from './remove';
import { cloneTool } from './clone';
import { healingBrushTool } from './healing-brush';
import { patchTool } from './patch';
import { smearTool } from './smear';
import { bucketTool } from './bucket';
import { burnTool, dodgeTool, spongeTool } from './tone';
import { historyBrushTool } from './history-brush';
import { frameTool } from './frame';
import { convertPointTool } from './convert-point';

export function registerBuiltinTools(): void {
  for (const tool of [historyBrushTool, frameTool, convertPointTool, moveTool, marqueeTool, lassoTool, objectSelectTool, quickSelectTool, wandTool, cropTool, brushTool, healTool, removeTool, healingBrushTool, patchTool, cloneTool, smearTool, dodgeTool, burnTool, spongeTool, gradientTool, bucketTool, shapeTool, pathSelectTool, directSelectTool, penTool, freeformPenTool, curvaturePenTool, typeTool, eyedropperTool, handTool, zoomTool]) registerTool(tool);
}
