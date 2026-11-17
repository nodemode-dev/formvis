import { afterEach, describe, expect, it, vi } from 'vitest';
import { beforeSelection, chooseSelectionModel, onSelectionModelOffer, selectionModels } from '../src/io/selection-models';

afterEach(() => { onSelectionModelOffer(null); vi.unstubAllGlobals(); });

describe('the recommended selection model', () => {
  it('is offered once a session for each kind, and the action waits for the answer', async () => {
    const offered: string[] = [];
    let release = (): void => undefined;
    onSelectionModelOffer((kind) => { offered.push(kind); return kind === 'subject' ? new Promise<void>((done) => { release = done; }) : Promise.resolve(); });
    let ran = false;
    const first = beforeSelection('subject').then(() => { ran = true; });
    await Promise.resolve();
    expect(ran).toBe(false);
    release();
    await first;
    expect(ran).toBe(true);
    await beforeSelection('subject');
    await beforeSelection('object');
    expect(offered).toEqual(['subject', 'object']);
  });

  it('a failed offer never stops the selection', async () => {
    onSelectionModelOffer(async () => { throw new Error('engine away'); });
    await expect(beforeSelection('object')).resolves.toBeUndefined();
  });

  it('with no window to ask, nothing is offered', async () => {
    await expect(beforeSelection('subject')).resolves.toBeUndefined();
  });

  it('reads and saves the choice through the engine', async () => {
    const state = { subject: { label: 'Select Subject', choice: 'small', active: 'u2net-onnx', options: [] }, object: { label: 'Object Selection', choice: 'recommended', active: 'sam2-onnx', options: [] } };
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(state), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect((await selectionModels())?.subject.choice).toBe('small');
    await chooseSelectionModel('subject', 'small');
    expect(fetch.mock.calls[1][0]).toBe('/api/selection-models');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ kind: 'subject', choice: 'small' });
    expect(fetch.mock.calls[1][1].method).toBe('PUT');
  });

  it('an engine that cannot be reached reads as no models, not an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await selectionModels()).toBeNull();
  });
});
