import { afterEach, describe, expect, it, vi } from 'vitest';
import { MISSING_MODEL_HEADER, localStyle, modelEntry, onMissingModel } from '../src/io/local-gen';

const missing = (model: string): Response => new Response(JSON.stringify({ detail: 'Download the style models first: Preferences > Plugins > Local models.' }), { status: 409, headers: { 'content-type': 'application/json', [MISSING_MODEL_HEADER]: model } });
const png = (): Response => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });
const picture = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

afterEach(() => { onMissingModel(null); vi.unstubAllGlobals(); });

describe('an action whose local model is missing', () => {
  it('asks to install the model the engine names, then sends the same action again', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(missing('fast-style')).mockResolvedValueOnce(png());
    vi.stubGlobal('fetch', fetch);
    const asked: string[] = [];
    onMissingModel(async (model) => { asked.push(model); return true; });
    const out = await localStyle(picture, 'candy');
    expect(asked).toEqual(['fast-style']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe('/api/style/local');
    expect(fetch.mock.calls[1][1]).toBe(fetch.mock.calls[0][1]);
    expect(out.size).toBe(4);
  });

  it('keeps the engine\'s message and sends nothing more when the person cancels', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(missing('fast-style'));
    vi.stubGlobal('fetch', fetch);
    onMissingModel(async () => false);
    await expect(localStyle(picture, 'candy')).rejects.toThrow('Download the style models first');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks once only: a second refusal after the install is reported, not asked again', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(missing('fast-style')).mockResolvedValueOnce(missing('fast-style'));
    vi.stubGlobal('fetch', fetch);
    const install = vi.fn(async () => true);
    onMissingModel(install);
    await expect(localStyle(picture, 'candy')).rejects.toThrow('Download the style models first');
    expect(install).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('a 409 that names no model is an ordinary error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'busy' }), { status: 409, headers: { 'content-type': 'application/json' } })));
    const install = vi.fn(async () => true);
    onMissingModel(install);
    await expect(localStyle(picture, 'candy')).rejects.toThrow('busy');
    expect(install).not.toHaveBeenCalled();
  });

  it('reads the model\'s name and download size from the engine\'s list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'lama-inpaint', name: 'LaMa inpainting (big-lama, ONNX)', ready: false, size: '208 MB' }]), { status: 200 })));
    expect(await modelEntry('lama-inpaint')).toEqual({ id: 'lama-inpaint', name: 'LaMa inpainting (big-lama, ONNX)', ready: false, size: '208 MB' });
  });
});
