import { describe, expect, it } from 'vitest';
import { documentFallback, frameBytes, rendererFallback } from '../src/gpu/fallback';

describe('rendererFallback', () => {
  const s = { chosenReason: 'automatic', displayReady: true, displayFailed: false };
  it('draws on the GPU only with WebGPU chosen and a display that started', () => {
    expect(rendererFallback({ ...s, mode: 'webgpu' })).toBeNull();
    expect(rendererFallback({ ...s, mode: 'webgpu', displayReady: false })).toBe('WebGPU is starting');
    expect(rendererFallback({ ...s, mode: 'webgpu', displayFailed: true })).toMatch(/could not start or was lost/);
  });
  it('says why the CPU draws otherwise', () => {
    expect(rendererFallback({ ...s, mode: 'cpu', chosenReason: 'Use Graphics Processor is off' })).toBe('Use Graphics Processor is off');
  });
  it('treats WebGL2 as WebGPU: drawn when ready, the reason named when not', () => {
    expect(rendererFallback({ ...s, mode: 'webgl2' })).toBeNull();
    expect(rendererFallback({ ...s, mode: 'webgl2', displayReady: false })).toBe('WebGL2 is starting');
    expect(rendererFallback({ ...s, mode: 'webgl2', displayFailed: true })).toBe('WebGL2 could not start or was lost, so drawing is on the CPU');
  });
});

describe('documentFallback', () => {
  const lim = { maxTexture: 8192, memoryBytes: 1024 * 1024 * 1024 };
  const layer = (width: number, height: number): { width: number; height: number } => ({ width, height });
  it('passes on what the engine cannot draw yet', () => {
    expect(documentFallback({ reason: 'layer masks' }, 800, 600, lim)).toBe('this document has layer masks');
  });
  it('sends a layer over the texture limit to the CPU, at the boundary exactly', () => {
    expect(documentFallback({ layers: [layer(8192, 100)] }, 800, 600, lim)).toBeNull();
    expect(documentFallback({ layers: [layer(100, 100), layer(8193, 100)] }, 800, 600, lim)).toBe("a layer (8193 x 100 px) is larger than this GPU's 8192 px texture limit");
  });
  it('holds to the memory limit, counting the layers and two screen-sized composites', () => {
    expect(frameBytes([layer(100, 100)], 10, 10)).toBe(100 * 100 * 4 + 10 * 10 * 8);
    const tight = { maxTexture: 8192, memoryBytes: frameBytes([layer(1000, 1000)], 800, 600) };
    expect(documentFallback({ layers: [layer(1000, 1000)] }, 800, 600, tight)).toBeNull();
    expect(documentFallback({ layers: [layer(1000, 1001)] }, 800, 600, tight)).toBe('this document is over the GPU memory limit');
  });
});
