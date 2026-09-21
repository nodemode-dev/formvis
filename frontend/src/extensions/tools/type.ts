import type { Tool } from '../registry';

/** Type (T): click a type layer to edit its text, or anywhere else to start new text whose first baseline begins at
 *  the click. The Type dialog does the typing; the tool announces where, for the app to open it. */
export const typeTool: Tool = {
  id: 'type', label: 'Type', key: 'T', order: 78,
  icon: () => 'typeTool',
  hint: () => 'Click to add text on a new type layer · Click a type layer to edit its text',
  cursor: () => 'text',
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    const hit = ctx.engine.textLayerAt(p.doc);
    document.dispatchEvent(new CustomEvent('cv:type', { detail: hit ? { layerId: hit } : { x: p.doc.x, y: p.doc.y } }));
  },
};
