import type { Engine } from '../engine';
import type { DocNote } from '../engine/types';
import { uid } from '../engine';

/** The notes a file holds: a PSD or PSB gives its text notes at their icons; a plain text file gives one note for each
 *  paragraph (blank-line separated), stacked down the left edge. Sound notes are skipped and counted. */
export async function readNotesFile(file: File, width: number, height: number): Promise<{ notes: DocNote[]; skipped: number }> {
  if (/\.(psd|psb|psdt)$/i.test(file.name)) {
    const { readPsd } = await import('ag-psd');
    const psd = readPsd(await file.arrayBuffer(), { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    const all = psd.annotations ?? [], text = all.filter((a) => a.type === 'text' && typeof a.data === 'string' && a.data.trim());
    const sx = psd.width > 0 ? width / psd.width : 1, sy = psd.height > 0 ? height / psd.height : 1;
    return { notes: text.map((a) => ({ id: uid(), x: Math.round(Math.max(0, Math.min(width, a.iconLocation.left * sx))), y: Math.round(Math.max(0, Math.min(height, a.iconLocation.top * sy))), text: (a.data as string).trim() })), skipped: all.length - text.length };
  }
  const paragraphs = (await file.text()).replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const step = Math.max(24, Math.round(height / Math.max(1, paragraphs.length + 1)));
  return { notes: paragraphs.map((text, i) => ({ id: uid(), x: Math.min(width, 16), y: Math.min(height, 16 + i * step), text })), skipped: 0 };
}

/** Adds the notes to the current document as one history step; returns how many were added. */
export function addNotes(engine: Engine, notes: DocNote[]): number {
  if (!notes.length) return 0;
  engine.edit('Import Notes', (p) => { p.doc = { ...p.doc, notes: [...(p.doc.notes ?? []), ...notes] }; return true; });
  return notes.length;
}
