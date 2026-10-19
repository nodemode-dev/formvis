import type { Commands } from './commands';
import { cleanBindings, loadPrefs, savePrefs } from './prefs';
import { toast } from './toast';

export interface KysResult {
  name: string;
  bindings: Record<string, string[]>;
  total: number;
  mapped: number;
  unmapped: string[];
}

interface Pair { name: string; keys: string }

const MODIFIERS: Record<string, 'Mod' | 'Shift' | 'Alt'> = { ctrl: 'Mod', control: 'Mod', cmd: 'Mod', command: 'Mod', meta: 'Mod', win: 'Mod', mod: 'Mod', shift: 'Shift', alt: 'Alt', opt: 'Alt', option: 'Alt' };
const NAMED_KEYS: Record<string, string> = {
  del: 'Delete', delete: 'Delete', esc: 'Escape', escape: 'Escape', return: 'Enter', enter: 'Enter', ins: 'Insert', insert: 'Insert',
  pgup: 'PageUp', pageup: 'PageUp', pgdn: 'PageDown', pgdown: 'PageDown', pagedown: 'PageDown', home: 'Home', end: 'End',
  space: 'Space', spacebar: 'Space', tab: 'Tab', backspace: 'Backspace', bksp: 'Backspace',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', uparrow: 'Up', downarrow: 'Down', leftarrow: 'Left', rightarrow: 'Right',
  plus: '=', equals: '=', equal: '=', minus: '-', hyphen: '-', comma: ',', period: '.', dot: '.', slash: '/', backslash: '\\',
};
const NO_KEY = /^(?:none|no shortcut|unassigned|\(none\)|\(unassigned\)|-|n\/a)?$/i;

/** The words of a command name reduced to letters and digits, so case, spacing and punctuation never decide a match. */
export const kysWords = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** One key string in the form saved bindings use (Alt+Shift+Mod+S), or null when it is not a key. */
export function kysKey(raw: string): string | null {
  let s = raw.trim().replace(/^(["'])(.*)\1$/, '$2').trim();
  if (!s) return null;
  let key = '';
  if (/\+\s*$/.test(s)) { key = '='; s = s.replace(/\+\s*\+?\s*$/, ''); }
  else if (/-\s*$/.test(s) && /[+]/.test(s)) { key = '-'; s = s.replace(/\+?\s*-\s*$/, ''); }
  const parts = (/\+/.test(s) || !/^[A-Za-z]+(?:-[A-Za-z]+)+$/.test(s) ? s.split(/\s*\+\s*/) : s.split('-')).map((p) => p.trim()).filter(Boolean);
  const flags = { Alt: false, Shift: false, Mod: false };
  for (const p of parts) {
    const m = MODIFIERS[p.toLowerCase()];
    if (m) { flags[m] = true; continue; }
    if (key) return null;
    const lower = p.toLowerCase();
    if (/^f([1-9]|1\d|2[0-4])$/.test(lower)) key = lower.toUpperCase();
    else if (lower in NAMED_KEYS) key = NAMED_KEYS[lower];
    else if (/^numpad\s*(\d)$/.test(lower) || /^num\s*(\d)$/.test(lower)) key = lower.slice(-1);
    else if (p.length === 1) key = /[a-z]/i.test(p) ? p.toUpperCase() : p;
    else return null;
  }
  if (!key) return null;
  return `${flags.Alt ? 'Alt+' : ''}${flags.Shift ? 'Shift+' : ''}${flags.Mod ? 'Mod+' : ''}${key}`;
}

/** Every key a string names; several may share one entry, split by "or", a semicolon, a bar, a slash with spaces or a comma and a space. */
export function kysKeys(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/\s+or\s+|\s*;\s*|\s*\|\s*|\s+\/\s+|,\s+/i)) { const k = kysKey(part); if (k && !out.includes(k)) out.push(k); }
  return out;
}

const XML_NAME_KEYS = ['name', 'command', 'commandname', 'menuitem', 'menu', 'title', 'label', 'caption', 'text', 'action', 'id'];
const XML_KEY_KEYS = ['key', 'keys', 'shortcut', 'shortcuts', 'shortcutkey', 'shortcutkeys', 'accelerator', 'hotkey', 'keystroke', 'keybinding', 'binding', 'keycombo'];

const unescapeXml = (s: string): string => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
  const l = e.toLowerCase();
  if (l[0] === '#') { const n = l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' } as Record<string, string>)[l] ?? '';
});

function attributesOf(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = unescapeXml(m[2] ?? m[3] ?? '');
  return out;
}

interface Rec { attrs: Record<string, string>; kids: Record<string, string>; text: string }

/** Command and key pairs from markup: an element carrying a name and a key, as attributes or as child elements or text. */
function xmlPairs(src: string): { pairs: Pair[]; title: string } {
  const pairs: Pair[] = [], stack: Array<{ tag: string; node: Rec }> = [];
  let title = '';
  const pick = (n: Rec, keys: string[]): string => { for (const k of keys) { const v = (n.attrs[k] ?? n.kids[k] ?? '').trim(); if (v) return v; } return ''; };
  const settle = (tag: string, n: Rec): void => {
    let name = pick(n, XML_NAME_KEYS), keys = pick(n, XML_KEY_KEYS);
    if (!keys && name && n.text.trim() && kysKeys(n.text.trim()).length) keys = n.text.trim();
    else if (!name && keys && n.text.trim()) name = n.text.trim();
    if (!title && !stack.length) title = n.attrs.name || n.attrs.title || '';
    if (name && keys) pairs.push({ name, keys });
    const parent = stack[stack.length - 1];
    if (parent && n.text.trim() && !Object.keys(n.attrs).length) parent.node.kids[tag] = n.text.trim();
  };
  for (const m of src.matchAll(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:"[^"]*"|'[^']*'|[^<>"'])*?)(\/?)>|([^<]+)/g)) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { if (top) top.node.text += m[1]; continue; }
    if (m[3] !== undefined) {
      const tag = m[3].toLowerCase();
      if (m[2]) {
        const done = stack.pop();
        if (done) settle(done.tag, done.node);
      } else if (m[5]) settle(tag, { attrs: attributesOf(m[4]), kids: {}, text: '' });
      else stack.push({ tag, node: { attrs: attributesOf(m[4]), kids: {}, text: '' } });
      continue;
    }
    if (m[6] !== undefined && top) top.node.text += unescapeXml(m[6]);
  }
  while (stack.length) { const d = stack.pop()!; settle(d.tag, d.node); }
  return { pairs, title };
}

/** Command and key pairs from text lines: a name and its keys split by a tab, an equals sign, a colon, quoted commas, two spaces, or the keys as the last words. */
function linePairs(src: string): Pair[] {
  const pairs: Pair[] = [];
  for (const raw of src.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/^[\s *•\-]+/, '').trimEnd();
    if (!line || /^(#|\/\/|;)/.test(line)) continue;
    let name = '', keys = '';
    const quoted = /^"([^"]*)"\s*[,;\t]\s*"([^"]*)"/.exec(line);
    const split = (re: RegExp): boolean => { const m = re.exec(line); if (!m) return false; name = line.slice(0, m.index).trim(); keys = line.slice(m.index + m[0].length).trim(); return !!name && (!!keys || NO_KEY.test(keys)); };
    if (quoted) { name = quoted[1]; keys = quoted[2]; }
    else if (!(split(/\t+/) || split(/\s*=\s*/) || split(/\s*:\s+/) || split(/\s*,\s+(?=\S)/) || split(/\s{2,}/))) {
      const m = /^(.*\S)\s+(\S+)$/.exec(line);
      if (!m || !kysKey(m[2]) || !/[+]|^f\d+$/i.test(m[2])) continue;
      name = m[1]; keys = m[2];
    }
    if (kysKeys(name).length && !kysKeys(keys).length && /[+]/.test(name)) [name, keys] = [keys, name];
    if (name) pairs.push({ name: name.replace(/^["']|["']$/g, ''), keys: keys.replace(/^["']|["']$/g, '') });
  }
  return pairs;
}

/** The names a command may go by in a file: as written, the last part of a menu path, and without a trailing note in brackets. */
function candidates(name: string): string[] {
  const out = new Set<string>();
  const add = (s: string): void => { const w = kysWords(s); if (w) out.add(w); };
  add(name);
  const last = name.split(/\s*(?:>|›|»|\s\|\s|\s\/\s)\s*/).pop() ?? name;
  add(last); add(last.replace(/\s*[(\[][^)\]]*[)\]]/g, ''));
  if (!/\s/.test(name) && name.includes('.')) add(name.split('.').pop() ?? name);
  return [...out];
}

/** Reads a shortcut set file and maps its menu command names to command ids by the catalogue's labels. `unmapped` lists the names with keys that no command answers to. */
export function parseKys(text: string, catalogue: ReadonlyArray<{ id: string; label: string }>, fileName = ''): KysResult {
  const src = text.replace(/^﻿/, '').replace(/\0/g, '');
  const byWords = new Map<string, string>();
  for (const c of catalogue) { const w = kysWords(c.label); if (w && !byWords.has(w)) byWords.set(w, c.id); }
  const markup = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<[A-Za-z]/.test(src);
  const read = markup ? xmlPairs(src) : { pairs: linePairs(src), title: '' };
  const pairs = read.pairs.length || !markup ? read.pairs : linePairs(src);
  const bindings: Record<string, string[]> = {};
  const unmapped: string[] = [];
  let mapped = 0;
  for (const p of pairs) {
    const keys = NO_KEY.test(p.keys.trim()) ? [] : kysKeys(p.keys);
    if (!keys.length && !NO_KEY.test(p.keys.trim())) continue;
    const id = candidates(p.name).map((w) => byWords.get(w)).find((v): v is string => !!v);
    if (!id) { if (keys.length && !unmapped.includes(p.name)) unmapped.push(p.name); continue; }
    const have = bindings[id] ?? (bindings[id] = []);
    for (const k of keys) if (!have.includes(k)) have.push(k);
    mapped++;
  }
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim();
  return { name: (read.title || base || 'Imported KYS').slice(0, 60), bindings: cleanBindings(bindings), total: mapped + unmapped.length, mapped, unmapped };
}

/** A file's text: UTF-16 with a byte order mark (common for these files) or UTF-8. */
export async function readKysFile(f: File): Promise<string> {
  const b = new Uint8Array(await f.arrayBuffer());
  if (b.length > 1 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b.length > 1 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  return new TextDecoder('utf-8').decode(b);
}

/** Keeps the result as a new named shortcut set and makes it the keys in use; the name gets a number when taken. Null when nothing mapped. */
export function applyKys(commands: Commands, r: KysResult): string | null {
  if (!Object.keys(r.bindings).length) return null;
  const p = loadPrefs();
  let name = r.name, n = 2;
  while (name in p.shortcutSets) name = `${r.name.slice(0, 54)} ${n++}`;
  commands.resetKeys();
  for (const [id, keys] of Object.entries(r.bindings)) if (commands.get(id)) commands.setKeys(id, keys);
  savePrefs({ ...p, shortcutSets: { ...p.shortcutSets, [name]: r.bindings }, shortcuts: commands.overrides() });
  return name;
}

/** The sentence that reports an import: how many commands were mapped and which names were not. */
export function kysSummary(r: KysResult, set: string | null): string {
  const lost = r.unmapped.length ? ` Not mapped (${r.unmapped.length}): ${r.unmapped.slice(0, 60).join(', ')}${r.unmapped.length > 60 ? `, and ${r.unmapped.length - 60} more` : ''}.` : '';
  if (!set) return `No command in that file matched a formvis command${r.unmapped.length ? '.' : ' (no command and key pairs were found).'}${lost}`;
  return `Imported ${set}: ${r.mapped} of ${r.total} shortcut${r.total === 1 ? '' : 's'} mapped.${lost}`;
}

/** Asks for a .kys file, then imports it as a new set; the first-launch notice and the shortcut editor share it. */
export function chooseKys(commands: Commands, done?: (set: string | null, text: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.kys,.xml,.txt,text/plain,text/xml';
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (!f) return;
    void readKysFile(f).then((text) => {
      const r = parseKys(text, commands.all().map((c) => ({ id: c.id, label: commands.label(c) })), f.name), set = applyKys(commands, r), say = kysSummary(r, set);
      if (done) done(set, say); else toast(say, set ? 'info' : 'error');
    }, () => { if (done) done(null, 'That file could not be read.'); else toast('That file could not be read.', 'error'); });
  });
  input.click();
}
