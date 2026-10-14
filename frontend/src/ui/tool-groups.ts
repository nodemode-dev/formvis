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

/** Fired on the document when Edit > Toolbar saves a layout; the rail re-applies it in place. */
export const TOOLBAR_EVENT = 'cv-toolbar-changed';

/** The rail's layout: the groups shown, in order, and the tools kept in Extra Tools. */
export interface ToolLayout { groups: ToolGroup[]; hidden: Tool[] }

/** The saved layout (null is the built-in one) against the tools registered now: unknown ids are dropped, a tool listed twice
 *  keeps its first place, and a tool the layout lacks (added in a later version) goes to the end of its default group. */
export function resolveLayout(pref: { groups: string[][]; hidden: string[] } | null): ToolLayout {
  if (!pref) return { groups: toolGroups(), hidden: [] };
  const known = new Map<string, Tool>(toolList().map((t) => [t.id, t]));
  const seen = new Set<string>();
  const take = (id: string): Tool | undefined => {
    const t = known.get(id);
    if (!t || seen.has(id)) return undefined;
    seen.add(id);
    return t;
  };
  const isTool = (t: Tool | undefined): t is Tool => t !== undefined;
  const groups: ToolGroup[] = [];
  for (const ids of pref.groups) {
    const tools = ids.map(take).filter(isTool);
    if (tools.length) groups.push({ key: tools[0].group ?? tools[0].key, tools });
  }
  const hidden = pref.hidden.map(take).filter(isTool);
  for (const t of toolList()) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const k = t.group ?? t.key, home = groups.find((g) => g.tools.some((x) => (x.group ?? x.key) === k));
    if (home) home.tools.push(t); else groups.push({ key: k, tools: [t] });
  }
  return { groups, hidden };
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
