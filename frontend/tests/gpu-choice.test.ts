import { describe, expect, it } from 'vitest';
import { chooseRenderer, detectedName, isSoftware, type GpuAdapter, type GpuProbe } from '../src/gpu/probe';

const gpu = (api: 'webgpu' | 'webgl2', name: string, software = false): GpuAdapter => ({ api, name, software, maxTexture: 16384 });
const metal: GpuProbe = { webgpu: gpu('webgpu', 'apple metal-3'), webgl2: gpu('webgl2', 'Apple M3') };
const linuxNvidia: GpuProbe = { webgpu: null, webgl2: gpu('webgl2', 'NVIDIA GeForce RTX 4070/PCIe/SSE2') };
const softwareOnly: GpuProbe = { webgpu: gpu('webgpu', 'google swiftshader', true), webgl2: gpu('webgl2', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))', true) };
const none: GpuProbe = { webgpu: null, webgl2: null };

describe('chooseRenderer', () => {
  it('Automatic takes hardware WebGPU first, then hardware WebGL2', () => {
    expect(chooseRenderer(metal, true, 'auto').mode).toBe('webgpu');
    expect(chooseRenderer(linuxNvidia, true, 'auto')).toMatchObject({ mode: 'webgl2', reason: 'automatic' });
  });
  it('Automatic never takes a software GPU, and says why', () => {
    const c = chooseRenderer(softwareOnly, true, 'auto');
    expect(c.mode).toBe('cpu');
    expect(c.reason).toMatch(/software/);
    expect(chooseRenderer(none, true, 'auto').reason).toMatch(/no graphics processor/);
  });
  it('a named renderer is used when present, even in software', () => {
    expect(chooseRenderer(softwareOnly, true, 'webgl2').mode).toBe('webgl2');
    expect(chooseRenderer(metal, true, 'webgl2').mode).toBe('webgl2');
  });
  it('a named renderer that is missing falls back to the other GPU API, then the CPU', () => {
    expect(chooseRenderer(linuxNvidia, true, 'webgpu')).toMatchObject({ mode: 'webgl2', reason: 'WebGPU is not available here' });
    expect(chooseRenderer(none, true, 'webgpu').mode).toBe('cpu');
  });
  it('off, or the CPU chosen, is the CPU', () => {
    expect(chooseRenderer(metal, false, 'auto')).toMatchObject({ mode: 'cpu', reason: 'Use Graphics Processor is off' });
    expect(chooseRenderer(metal, true, 'cpu').mode).toBe('cpu');
  });
});

describe('detection helpers', () => {
  it('recognises software rasterisers', () => {
    for (const n of ['SwiftShader Device', 'llvmpipe (LLVM 17.0.6, 256 bits)', 'lavapipe', 'Microsoft Basic Render Driver']) expect(isSoftware(n)).toBe(true);
    for (const n of ['NVIDIA GeForce RTX 4070', 'Apple M3', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11)']) expect(isSoftware(n)).toBe(false);
  });
  it('names the hardware processor first', () => {
    expect(detectedName({ webgpu: gpu('webgpu', 'google swiftshader', true), webgl2: gpu('webgl2', 'NVIDIA GeForce RTX 4070') })).toBe('NVIDIA GeForce RTX 4070');
    expect(detectedName(softwareOnly)).toBe('google swiftshader (software)');
    expect(detectedName(none)).toBeNull();
  });
});
