/** File formats that plug-ins open or save (the formats permission). A plug-in's worker decodes and encodes; this list is
 *  what Open, drag and drop and the Export As commands consult. Pixels are 8 bit RGBA, width * height * 4 bytes. */
export interface FormatImage { width: number; height: number; data: Uint8ClampedArray }
export interface FormatPlugin {
  id: string;
  label: string;
  extensions: string[];
  decode: ((bytes: Uint8Array, name: string) => Promise<FormatImage>) | null;
  encode: ((image: FormatImage) => Promise<Uint8Array>) | null;
}

const formats = new Map<string, FormatPlugin>();
const extOf = (name: string): string => (/\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1] ?? '').toLowerCase();

/** Adds a format; the returned function takes it away again if it is still the one registered under that id. */
export function addFormat(f: FormatPlugin): () => void {
  formats.set(f.id, f);
  return () => { if (formats.get(f.id) === f) formats.delete(f.id); };
}

/** The plug-in that opens a file of this name, by its extension. */
export function decoderFor(name: string): FormatPlugin | undefined {
  const ext = extOf(name);
  return ext ? [...formats.values()].find((f) => f.decode && f.extensions.includes(ext)) : undefined;
}

export function pluginFormats(): FormatPlugin[] { return [...formats.values()]; }

/** The extensions plug-ins can open, each with its dot, for an Open panel's or a picker's filter. */
export function decodeExtensions(): string[] { return [...new Set([...formats.values()].filter((f) => f.decode).flatMap((f) => f.extensions.map((x) => `.${x}`)))]; }
