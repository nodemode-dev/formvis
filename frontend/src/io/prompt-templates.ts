/** Prompt templates for prompt improvement (1.51.5): the instruction the language model follows when it rewrites a
 *  prompt. Three to start; each can be edited, added to or removed in Preferences > Plugins. */
import { api } from './api';

export interface PromptTemplate { name: string; text: string; /** Model names (comma separated) this template is for; empty is any model. */ for?: string }
const KEY = 'formvis.promptTemplates';

export const STARTERS: readonly PromptTemplate[] = [
  { name: 'Richer detail', text: 'You rewrite prompts for an image model. Keep the subject and the intent. Add concrete visual detail: materials, lighting, lens and framing, colour and mood. Write one or two sentences.' },
  { name: 'Fill a selection', text: 'You rewrite prompts for filling a selected area of an existing picture. Describe only what should appear in that area, so that it blends with what surrounds it: the same light, perspective and texture. Write one sentence.' },
  { name: 'Short and plain', text: 'You tidy prompts for an image model: correct the spelling, remove filler words, and keep it short and literal.' },
];

export function templates(): PromptTemplate[] {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;
    if (Array.isArray(r)) { const list = r.filter((t): t is PromptTemplate => typeof t?.name === 'string' && typeof t?.text === 'string'); if (list.length) return list; }
  } catch { /* the starters */ }
  return STARTERS.map((t) => ({ ...t }));
}

/** Templates read from the data folder's prompt-templates folder (Markdown files); one with the name of a kept template overrides it. */
let folderList: PromptTemplate[] = [];
let modelNow = '';
let folderPath = '';

/** Reads the folder and the language model in use again; the folder's path. */
export async function syncTemplates(): Promise<string> {
  const [files, st] = await Promise.all([api.promptTemplateFiles(), api.llmStatus()]);
  modelNow = st?.model ?? '';
  if (files) {
    folderPath = files.folder;
    folderList = files.files.map((f) => templateFromMarkdown(f.text, f.file.replace(/\.[^.]+$/, ''))).filter((t): t is PromptTemplate => !!t);
  }
  return folderPath;
}

export const folderTemplateCount = (): number => folderList.length;

/** Whether a template is for the model in use: no `for` is any model, else one of its names is part of the model's name. */
const fitsModel = (t: PromptTemplate): boolean => !t.for || !modelNow || t.for.split(',').some((m) => m.trim() && modelNow.toLowerCase().includes(m.trim().toLowerCase()));

/** The templates to choose from when improving a prompt: the kept ones with the folder's laid over them, for the model in use. */
export function usableTemplates(): PromptTemplate[] {
  const over = new Map(folderList.map((t) => [t.name, t]));
  const list = [...templates().map((t) => over.get(t.name) ?? t), ...folderList.filter((t) => !templates().some((k) => k.name === t.name))].filter(fitsModel);
  return list.length ? list : templates();
}

/** A template as a Markdown file: front matter with its name, then the instruction. */
export function templateToMarkdown(t: PromptTemplate): string {
  return `---\nname: ${t.name.replace(/[\r\n]+/g, ' ')}\nuse: improve\n${t.for ? `for: ${t.for.replace(/[\r\n]+/g, ' ')}\n` : ''}---\n\n${t.text.trim()}\n`;
}

/** A template from a Markdown file. Front matter (`name`, and `use` which must be improve when given) is optional; the rest
 *  is the instruction. A file for another use is refused with null. */
export function templateFromMarkdown(src: string, fallbackName: string): PromptTemplate | null {
  const text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let name = fallbackName, body = text, forModels = '';
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (m) {
    body = text.slice(m[0].length);
    for (const line of m[1].split('\n')) {
      const kv = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line);
      if (!kv) continue;
      const v = kv[2].trim().replace(/^["']|["']$/g, '');
      if (kv[1].toLowerCase() === 'name' && v) name = v;
      if (kv[1].toLowerCase() === 'for') forModels = v.slice(0, 200);
      if (kv[1].toLowerCase() === 'use' && v && v.toLowerCase() !== 'improve') return null;
    }
  }
  body = body.trim();
  return body ? { name: name.slice(0, 80), text: body.slice(0, 8000), ...(forModels ? { for: forModels } : {}) } : null;
}

/** The open document's size, set by the app, for {width}, {height} and {size} in a template. */
export const templateContext: { size: () => { width: number; height: number } | null } = { size: () => null };

/** The instruction with {prompt} replaced by the prompt being improved, and {width}, {height} and {size} (such as 1024x768)
 *  by the open document's; empty when none is open. */
export const fillPlaceholders = (text: string, vars: { prompt: string }): string => {
  const s = templateContext.size();
  return text.replace(/\{(prompt|width|height|size)\}/g, (_, k: string) => k === 'prompt' ? vars.prompt : !s ? '' : k === 'width' ? String(s.width) : k === 'height' ? String(s.height) : `${s.width}x${s.height}`);
};

export function saveTemplates(list: PromptTemplate[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40).map((t) => ({ name: t.name.slice(0, 80), text: t.text.slice(0, 8000), ...(t.for ? { for: t.for.slice(0, 200) } : {}) })))); } catch { /* not kept */ }
}
