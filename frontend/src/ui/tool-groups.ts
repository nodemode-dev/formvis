import type { Engine, ToolId } from '../engine';
import { toolList, type Tool } from '../extensions/registry';

/** Tool groups as Photoshop's toolbar has them: the tools that share a shortcut key share one slot (M the marquees, J
 *  the healing tools, P the pens), in the order of their first tool. Each slot shows the tool last chosen from it, which
 *  its key also picks; the choice is kept with the preferences. */

export interface ToolGroup { key: string; tools: Tool[] }
const STORE = 'formvis.toolGroups.last';

export function toolGroups(): ToolGroup[] {
  const out: ToolGroup[] = [];
  for (const t of toolList()) {
    const k = t.group ?? t.key, g = out.find((x) => x.key === k);
    if (g) g.tools.push(t); else out.push({ key: k, tools: [t] });
  }
  return out;
}

const last = new Map<string, ToolId>();
try {
  const raw = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') last.set(k, v as ToolId);
} catch { /* no saved choice */ }

/** The tool a group's slot shows: the active tool when it is in the group, else the last chosen, else the first. */
export function slotTool(g: ToolGroup, active: ToolId): Tool {
  return g.tools.find((t) => t.id === active) ?? g.tools.find((t) => t.id === last.get(g.key)) ?? g.tools[0];
}

/** Remembers the active tool as its group's choice; called whenever the tool changes. */
export function rememberTool(engine: Engine): void {
  const t = toolList().find((x) => x.id === engine.tool);
  if (!t || last.get(t.key) === t.id) return;
  last.set(t.key, t.id);
  try { localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(last))); } catch { /* kept for the session */ }
}
