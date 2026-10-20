/** Prompt templates for prompt improvement (1.51.5): the instruction the language model follows when it rewrites a
 *  prompt. Three to start; each can be edited, added to or removed in Preferences > Plugins. */
import { api } from './api';

export type TemplateUse = 'improve' | 'assistant' | 'generate';
/** `use` says what the instruction is for (Improve Prompt when left out); `for` names the language models (improve, assistant) or the routes and models (generate) it fits. */
export interface PromptTemplate { name: string; text: string; /** Model names (comma separated) this template is for; empty is any model. */ for?: string; use?: TemplateUse }
const KEY = 'formvis.promptTemplates';

export const STARTERS: readonly PromptTemplate[] = [
  { name: 'Richer detail', text: 'You rewrite prompts for an image model. Keep the subject and the intent. Add concrete visual detail: materials, lighting, lens and framing, colour and mood. Write one or two sentences.' },
  { name: 'Fill a selection', text: 'You rewrite prompts for filling a selected area of an existing picture. Describe only what should appear in that area, so that it blends with what surrounds it: the same light, perspective and texture. Write one sentence.' },
  { name: 'Short and plain', text: 'You tidy prompts for an image model: correct the spelling, remove filler words, and keep it short and literal.' },
  { name: 'Generate a new picture', text: 'You rewrite prompts for making a new picture from nothing. Keep the subject and the intent. Name the subject, its setting, the composition, the light and the style, in the order a person would look at the picture. Write two or three sentences.' },
  { name: 'Edit instruction', text: 'You rewrite prompts that tell an image model how to change an existing picture. Write one imperative sentence that names what to change and what to keep as it is. Do not describe the whole picture.' },
  { name: 'Photographic', text: 'You rewrite prompts for a photographic picture. Keep the subject and the intent. Add what a photographer would set: lens and focal length, aperture and depth of field, light and its direction, time of day, film or sensor look, and framing. Write two sentences.' },
  { name: 'Tag list', text: 'You rewrite prompts as a list of short tags for an image model. Keep the subject and the intent. Give the subject first, then setting, style, light and quality tags, each two words at most, separated by commas, with no sentences.' },
  { name: 'Transparent asset', text: 'You rewrite prompts for a single object that will be cut out and placed on other pictures. Describe the object alone on a plain, even background, whole and centred, with soft even light and no cast shadow, no text and no other objects. Write one or two sentences.' },
];

/** What a prompt is for: the use case a person picks in Improve Prompt. `template` is the starter it chooses and `purpose` is what the model is told. */
export interface UseCase { id: string; label: string; template: string; purpose: string }
export const USE_CASES: readonly UseCase[] = [
  { id: 'generate', label: 'Generate a new picture', template: 'Generate a new picture', purpose: 'making a new picture from nothing' },
  { id: 'fill', label: 'Fill a selection', template: 'Fill a selection', purpose: 'filling a selected area of an existing picture' },
  { id: 'edit', label: 'Edit instruction', template: 'Edit instruction', purpose: 'an instruction that changes an existing picture' },
  { id: 'photo', label: 'Photographic', template: 'Photographic', purpose: 'a photographic picture' },
  { id: 'tags', label: 'Tag list', template: 'Tag list', purpose: 'a model that reads a list of tags' },
  { id: 'asset', label: 'Transparent asset', template: 'Transparent asset', purpose: 'an object to be cut out and placed on other pictures' },
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
export function usableTemplates(use: TemplateUse = 'improve'): PromptTemplate[] {
  const over = new Map(folderList.map((t) => [t.name, t]));
  const list = [...templates().map((t) => over.get(t.name) ?? t), ...folderList.filter((t) => !templates().some((k) => k.name === t.name))].filter((t) => (t.use ?? 'improve') === use && (use === 'generate' || fitsModel(t)));
  return list.length || use !== 'improve' ? list : templates();
}

/** The assistant templates for the language model in use, each after the assistant's own instructions. */
export async function assistantInstructions(): Promise<string> {
  await syncTemplates().catch(() => '');
  return usableTemplates('assistant').map((t) => fillPlaceholders(t.text, { prompt: '' }).trim()).filter(Boolean).map((x) => `\n\n${x}`).join('');
}

/** The prompt as a generate template shapes it for a route (fal, comfyui, local or a provider) or model: the template whose `for` names it, else one for any; the prompt as it is when there is none. */
export async function generatePrompt(prompt: string, route: string): Promise<string> {
  await syncTemplates().catch(() => '');
  const all = usableTemplates('generate'), r = route.toLowerCase();
  const t = all.find((x) => x.for && x.for.split(',').some((m) => m.trim() && r.includes(m.trim().toLowerCase()))) ?? all.find((x) => !x.for);
  if (!t) return prompt;
  const filled = fillPlaceholders(t.text, { prompt, model: route });
  return t.text.includes('{prompt}') ? filled : `${filled} ${prompt}`.trim();
}

/** A template as a Markdown file: front matter with its name, then the instruction. */
export function templateToMarkdown(t: PromptTemplate): string {
  return `---\nname: ${t.name.replace(/[\r\n]+/g, ' ')}\nuse: ${t.use ?? 'improve'}\n${t.for ? `for: ${t.for.replace(/[\r\n]+/g, ' ')}\n` : ''}---\n\n${t.text.trim()}\n`;
}

/** A template from a Markdown file. Front matter (`name`, `use` as improve, assistant or generate, and `for`) is optional; the
 *  rest is the instruction. A file with any other use is refused with null. */
export function templateFromMarkdown(src: string, fallbackName: string): PromptTemplate | null {
  const text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let name = fallbackName, body = text, forModels = '', use: TemplateUse = 'improve';
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (m) {
    body = text.slice(m[0].length);
    for (const line of m[1].split('\n')) {
      const kv = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line);
      if (!kv) continue;
      const v = kv[2].trim().replace(/^["']|["']$/g, '');
      if (kv[1].toLowerCase() === 'name' && v) name = v;
      if (kv[1].toLowerCase() === 'for') forModels = v.slice(0, 200);
      if (kv[1].toLowerCase() === 'use' && v) {
        const u = v.toLowerCase();
        if (u !== 'improve' && u !== 'assistant' && u !== 'generate') return null;
        use = u;
      }
    }
  }
  body = body.trim();
  return body ? { name: name.slice(0, 80), text: body.slice(0, 8000), ...(forModels ? { for: forModels } : {}), ...(use !== 'improve' ? { use } : {}) } : null;
}

/** The open document's size, set by the app, for {width}, {height} and {size} in a template. */
export const templateContext: { size: () => { width: number; height: number } | null } = { size: () => null };

/** The instruction with {prompt} replaced by the prompt being improved, {model} by the model or route (the language model in
 *  use when none is given), and {width}, {height} and {size} (such as 1024x768) by the open document's; empty when none is open. */
export const fillPlaceholders = (text: string, vars: { prompt: string; model?: string }): string => {
  const s = templateContext.size();
  return text.replace(/\{(prompt|width|height|size|model)\}/g, (_, k: string) => k === 'prompt' ? vars.prompt : k === 'model' ? vars.model ?? modelNow : !s ? '' : k === 'width' ? String(s.width) : k === 'height' ? String(s.height) : `${s.width}x${s.height}`);
};

export function saveTemplates(list: PromptTemplate[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40).map((t) => ({ name: t.name.slice(0, 80), text: t.text.slice(0, 8000), ...(t.for ? { for: t.for.slice(0, 200) } : {}), ...(t.use && t.use !== 'improve' ? { use: t.use } : {}) })))); } catch { /* not kept */ }
}
