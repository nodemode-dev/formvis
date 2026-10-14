import type { Engine, RGB } from '../../engine';
import { toolList, type OptionSpec, type Tool } from '../../extensions/registry';
import { Dialog, promptName } from '../dialogs';
import { el, q } from '../dom';
import { skipped } from '../option-memory';
import { toast } from '../toast';
import { checkRow } from './controls';

/** Window > Tool Presets (DEV_PLAN 35.3 part a): named snapshots of one tool's option values, kept in localStorage.
 *  A snapshot reads the tool's option specs (the same get/set pairs the options bar and option memory use); Apply
 *  switches to the tool and writes each value back through its spec's set. */

export interface ToolPreset { name: string; tool: string; values: Record<string, unknown> }
type Settable = Extract<OptionSpec, { kind: 'segment' | 'range' | 'toggle' | 'select' | 'color' | 'number' }>;

const KEY = 'formvis.toolPresets';
const settable = (s: OptionSpec): s is Settable => s.kind !== 'title' && s.kind !== 'readout' && s.kind !== 'button';
const hex = (c: RGB): string => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function isPreset(v: unknown): v is ToolPreset {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.name === 'string' && typeof o.tool === 'string' && !!o.values && typeof o.values === 'object';
}
function loadPresets(): ToolPreset[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(isPreset) : [];
  } catch { return []; }
}
function savePresets(list: ToolPreset[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable: presets live for the session */ }
}

/** The settable specs of a tool with the key each is stored under (a repeated label gets a count). */
function keyed(tool: Tool, specs: OptionSpec[]): Array<{ spec: Settable; key: string }> {
  const seen = new Map<string, number>(), out: Array<{ spec: Settable; key: string }> = [];
  for (const spec of specs) {
    if (!settable(spec) || skipped(tool.id, spec.label ?? '')) continue;   // not Move's X or Type's Color: they describe the document
    const label = spec.label || 'option', n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    out.push({ spec, key: `${tool.id}.${label}${n > 1 ? `#${n}` : ''}` });
  }
  return out;
}

export class ToolPresetsDialog extends Dialog {
  private presets: ToolPreset[] = loadPresets();
  private currentOnly = true;
  private readonly list = el<HTMLSelectElement>('<select class="cv-input" size="10" style="width: 100%; height: 220px" aria-label="Tool presets"></select>');
  private readonly empty = el('<p class="cv-dialog-note" role="status"></p>');
  private readonly only: { el: HTMLElement; set(v: boolean): void };

  constructor(private readonly engine: Engine) {
    super('Tool Presets', 520);
    this.only = checkRow('Current Tool Only', (v) => { this.currentOnly = v; this.paint(); });
    this.only.set(true);
    this.body.append(this.only.el, this.list, this.empty, el('<p class="cv-dialog-note">Export writes every preset to a .json file; Import merges one by name. Photoshop .tpl files are not read.</p>'));
    this.button('New Preset...', 'ghost', () => void this.create());
    this.button('Apply', 'primary', () => this.applySelected());
    this.button('Export...', 'ghost', () => this.exportFile());
    this.button('Import...', 'ghost', () => this.importFile());
    this.button('Delete', 'danger', () => this.remove());
    this.button('Done', 'ghost', () => this.close());
    this.list.addEventListener('dblclick', () => this.applySelected());
  }

  show(): void {
    this.paint();
    this.open();
  }

  private toolOf(id: string): Tool | undefined { return toolList().find((t) => t.id === id); }

  /** The visible presets, in saved order, with their index in the full list. */
  private visible(): number[] {
    const out: number[] = [];
    this.presets.forEach((p, i) => { if (!this.currentOnly || p.tool === this.engine.tool) out.push(i); });
    return out;
  }

  private paint(): void {
    const idx = this.visible();
    this.list.replaceChildren(...idx.map((i) => {
      const o = document.createElement('option'), p = this.presets[i];
      o.value = String(i);
      o.textContent = this.currentOnly ? p.name : `${p.name} (${this.toolOf(p.tool)?.label ?? p.tool})`;
      return o;
    }));
    this.empty.textContent = idx.length ? '' : 'No presets yet. New Preset... saves the current tool\'s options.';
  }

  private snapshot(tool: Tool): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    if (!tool.options) return values;
    for (const { spec, key } of keyed(tool, tool.options(this.engine))) {
      let v: unknown;
      try { v = spec.get(); } catch { continue; }
      if (spec.kind === 'color') { if (v && typeof v === 'object') values[key] = hex(v as RGB); }
      else if (v !== null && v !== undefined) values[key] = v;
    }
    return values;
  }

  private async create(): Promise<void> {
    const tool = this.toolOf(this.engine.tool);
    if (!tool?.options) { toast('The active tool has no options to save.', 'info'); return; }
    const n = this.presets.filter((p) => p.tool === tool.id).length + 1;
    const name = await promptName('New Tool Preset', `${tool.label} ${n}`);
    if (!name || !name.trim()) return;
    const clean = name.trim(), next: ToolPreset = { name: clean, tool: tool.id, values: this.snapshot(tool) };
    const at = this.presets.findIndex((p) => p.name === clean && p.tool === tool.id);
    if (at >= 0) this.presets[at] = next; else this.presets.push(next);
    savePresets(this.presets);
    this.paint();
  }

  /** Switches to the preset's tool and writes its values back; false when the tool is gone. */
  private applyPreset(p: ToolPreset): boolean {
    const tool = this.toolOf(p.tool);
    if (!tool?.options) return false;
    if (this.engine.tool !== tool.id) this.engine.setTool(tool.id);
    for (const { spec, key } of keyed(tool, tool.options(this.engine))) {
      if (!(key in p.values)) continue;
      const v = p.values[key];
      try {
        if (spec.kind === 'color') {
          if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) spec.set({ r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) });
        } else if (spec.kind === 'toggle') { if (typeof v === 'boolean') spec.set(v); }
        else if (spec.kind === 'range' || spec.kind === 'number') { if (typeof v === 'number' && Number.isFinite(v)) spec.set(v); }
        else if (typeof v === 'string') spec.set(v);
      } catch { /* one value that cannot be put back leaves the rest */ }
    }
    this.engine.emit('options', null);
    return true;
  }

  /** Applies the preset called `name` with no dialog (the tool-preset-apply command). */
  applyByName(name: string): boolean {
    const here = this.presets.find((p) => p.name === name && p.tool === this.engine.tool) ?? this.presets.find((p) => p.name === name);
    return here ? this.applyPreset(here) : false;
  }

  private applySelected(): void {
    const i = Number(this.list.value);
    const p = this.list.value === '' ? undefined : this.presets[i];
    if (!p) { toast('Choose a preset first.', 'info'); return; }
    if (!this.applyPreset(p)) toast('That preset\'s tool is not available.', 'info');
    this.paint();
  }

  /** Writes every preset to formvis-tool-presets.json. */
  private exportFile(): void {
    if (!this.presets.length) { toast('There are no tool presets to export.', 'info'); return; }
    const blob = new Blob([JSON.stringify({ formvis: 'tool-presets', version: 1, presets: this.presets }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'formvis-tool-presets.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /** Reads a tool presets file and merges it by name; a same-named preset is replaced, unknown tools are skipped and counted. */
  private importFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => void (async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const raw: unknown = JSON.parse(await f.text());
        if (!raw || typeof raw !== 'object') throw new Error('Not a tool presets file.');
        const head = raw as Record<string, unknown>;
        if (head.formvis !== 'tool-presets' || head.version !== 1 || !Array.isArray(head.presets)) throw new Error('Not a formvis tool presets file.');
        let added = 0, unknown = 0, invalid = 0;
        for (const item of head.presets as unknown[]) {
          if (!isPreset(item)) { invalid += 1; continue; }
          if (!this.toolOf(item.tool)) { unknown += 1; continue; }
          const values: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(item.values)) {
            if (typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) values[k] = v;
          }
          const name = item.name.trim();
          if (!name) { invalid += 1; continue; }
          const next: ToolPreset = { name, tool: item.tool, values }, at = this.presets.findIndex((p) => p.name === name);
          if (at >= 0) this.presets[at] = next; else this.presets.push(next);
          added += 1;
        }
        savePresets(this.presets);
        this.paint();
        const extra = [unknown ? `${unknown} for unknown tools skipped` : '', invalid ? `${invalid} invalid skipped` : ''].filter(Boolean).join(', ');
        toast(`Imported ${added} tool ${added === 1 ? 'preset' : 'presets'}${extra ? ` (${extra})` : ''}.`, added ? 'info' : 'error');
      } catch (err) { toast(`${f.name}: ${err instanceof Error ? err.message : String(err)}`, 'error'); }
    })());
    input.click();
  }

  private remove(): void {
    if (this.list.value === '') return;
    this.presets.splice(Number(this.list.value), 1);
    savePresets(this.presets);
    this.paint();
  }
}
